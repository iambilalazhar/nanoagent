import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { generateText } from 'ai';
import { google } from '@/lib/ai/providers';

export const runtime = 'nodejs';

async function decodeGeneratedImageFile(file: unknown): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
	if (!file || typeof file !== 'object') return null;
	
	const fileObj = file as Record<string, unknown>;
	const fallbackType = 'image/png';
	const mediaType: string = typeof fileObj.mediaType === 'string' && fileObj.mediaType.length > 0 ? fileObj.mediaType : fallbackType;

	if (fileObj.data instanceof Uint8Array && fileObj.data.byteLength > 0) {
		return { bytes: fileObj.data, mediaType };
	}
	if (fileObj.data instanceof ArrayBuffer && fileObj.data.byteLength > 0) {
		return { bytes: new Uint8Array(fileObj.data), mediaType };
	}
	if (typeof fileObj.base64 === 'string' && fileObj.base64.length > 0) {
		const buf = Buffer.from(fileObj.base64, 'base64');
		return { bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), mediaType };
	}
	if (typeof fileObj.url === 'string' && fileObj.url.length > 0) {
		try {
			const res = await fetch(fileObj.url);
			if (res.ok) {
				const ab = await res.arrayBuffer();
				return { bytes: new Uint8Array(ab), mediaType: res.headers.get('Content-Type') || mediaType };
			}
		} catch {}
	}

	return null;
}

type EvaluateResult = {
	isAcceptable: boolean;
	feedback?: string;
};

async function evaluateWithGemini({
	prompt,
	originalImageData,
	originalMediaType,
	candidateImageData,
	candidateMediaType,
}: {
	prompt: string;
	originalImageData: Uint8Array;
	originalMediaType: string;
	candidateImageData: Uint8Array;
	candidateMediaType: string;
}): Promise<EvaluateResult> {
	const { text } = await generateText({
		model: google('gemini-2.5-flash'),
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'text', text: `User requirements (all must be met): ${prompt}` },
					{ type: 'text', text: 'Original image:' },
					{ type: 'file', data: originalImageData, mediaType: originalMediaType },
					{ type: 'text', text: 'Candidate edited image:' },
					{ type: 'file', data: candidateImageData, mediaType: candidateMediaType },
					{ type: 'text', text: 'Be strict. First, verify the main subject/character identity matches the original (face/structure/skin tone/hair/unique features). If identity changed, answer NO. Otherwise, verify the candidate fully satisfies ALL requirements (content, style, composition, colors, objects and their counts, text/typography if any, aspect ratio, and other constraints). Answer YES only if everything is satisfied. If not, answer NO and provide a brief, actionable critique to improve the next iteration.' },
				],
			},
		],
	});

	const normalized = text.trim().toLowerCase();
	const isAcceptable = normalized.startsWith('yes');
	return { isAcceptable, feedback: text };
}

export async function POST(req: NextRequest) {
	const formData = await req.formData();
	const prompt = String(formData.get('prompt') || '').trim();
	const imageFiles = formData.getAll('image').filter((f): f is File => f instanceof File);
	const maxIterations = Number(formData.get('maxIterations') || 10);

	if (!prompt) {
		return Response.json({ error: 'Missing prompt' }, { status: 400 });
	}
	if (imageFiles.length === 0) {
		return Response.json({ error: 'Missing image files' }, { status: 400 });
	}

	// Process all uploaded images
	const processedImages: { data: Uint8Array; mediaType: string }[] = [];
	for (const imageFile of imageFiles) {
		const uploadedArrayBuffer = await imageFile.arrayBuffer();
		const normalizedBuffer = await sharp(Buffer.from(uploadedArrayBuffer))
			.ensureAlpha()
			.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
			.png({ quality: 95 })
			.toBuffer();
		processedImages.push({
			data: new Uint8Array(normalizedBuffer.buffer, normalizedBuffer.byteOffset, normalizedBuffer.byteLength),
			mediaType: 'image/png'
		});
	}

	const originalImageData = processedImages[0].data;
	const originalMediaType = processedImages[0].mediaType;

	// The actual image editing logic will be handled in the custom stream below

	// Transform the stream to emit AI SDK-style data frames that the client expects
	const customStream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const enqueueFrame = (data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`0:${JSON.stringify(data)}\n`));
				} catch {}
			};

			// Initial status
			enqueueFrame({ type: 'status', message: '🎨 Starting image editing process...' });

			let currentImage = originalImageData;
			let currentMediaType = originalMediaType;
			let lastFeedback: string | undefined;

			try {
				for (let i = 0; i < Math.max(1, Math.min(12, maxIterations)); i++) {
					enqueueFrame({ type: 'status', message: `Iteration ${i + 1}/${maxIterations}: generating candidate...` });

					const identityGuard = "Important: Preserve the main subject's identity from the original image(s). Do not change facial identity, facial structure, skin tone, hairline/style, or other distinctive features. Only make the requested edits.";
					const iterationPrompt = lastFeedback
						? `${prompt}\nAddress these issues from the last result: ${lastFeedback}\n\n${identityGuard}`
						: `${prompt}\nRefine subtly to better match if needed.\n\n${identityGuard}`;

					// Generate image using gemini-2.5-flash-image-preview
					const imageResult = await generateText({
						model: google('gemini-2.5-flash-image-preview'),
						providerOptions: { google: { responseModalities: ['TEXT', 'IMAGE'] } },
						messages: [
							{
								role: 'user',
								content: [
									{ type: 'text', text: iterationPrompt },
									{ type: 'file', data: currentImage, mediaType: currentMediaType },
									...processedImages.slice(1).map(img => ({
										type: 'file' as const,
										data: img.data,
										mediaType: img.mediaType
									}))
								],
							},
						],
					});

					enqueueFrame({ type: 'status', message: `Iteration ${i + 1}/${maxIterations}: decoding and normalizing...` });

					const outFile = imageResult.files?.find((f: unknown) => {
						if (typeof f !== 'object' || f === null) return false;
						const fileObj = f as Record<string, unknown>;
						return typeof fileObj.mediaType === 'string' && fileObj.mediaType.startsWith('image/');
					});

					if (!outFile) {
						enqueueFrame({ type: 'error', message: `No image generated in iteration ${i + 1}` });
						break;
					}

					const decoded = await decodeGeneratedImageFile(outFile);
					if (!decoded || decoded.bytes.byteLength === 0) {
						enqueueFrame({ type: 'error', message: `Empty image generated in iteration ${i + 1}` });
						break;
					}

					// Normalize the generated image
					const candidatePng = await sharp(Buffer.from(decoded.bytes.buffer, decoded.bytes.byteOffset, decoded.bytes.byteLength))
						.ensureAlpha()
						.png({ quality: 95 })
						.toBuffer();
					const candidate = new Uint8Array(candidatePng.buffer, candidatePng.byteOffset, candidatePng.byteLength);
					const candidateMediaType = 'image/png';
					enqueueFrame({ type: 'status', message: `Iteration ${i + 1}/${maxIterations}: image ready.` });

					// Stream the generated image as base64 in a data frame
					const base64Image = Buffer.from(candidate).toString('base64');
					enqueueFrame({ type: 'image', iteration: i, base64: base64Image, mediaType: candidateMediaType });
					enqueueFrame({ type: 'status', message: `Iteration ${i + 1}/${maxIterations}: evaluating against requirements...` });

					// Evaluate the result
					const evaluation = await evaluateWithGemini({
						prompt,
						originalImageData,
						originalMediaType,
						candidateImageData: candidate,
						candidateMediaType,
					});

					lastFeedback = evaluation.feedback;
					enqueueFrame({ type: 'evaluation', iteration: i, feedback: lastFeedback, isAcceptable: evaluation.isAcceptable });
					enqueueFrame({ type: 'status', message: evaluation.isAcceptable ? `Iteration ${i + 1}/${maxIterations}: accepted by evaluator.` : `Iteration ${i + 1}/${maxIterations}: needs refinement, continuing...` });

					if (evaluation.isAcceptable) {
						enqueueFrame({ type: 'complete' });
						break;
					}

					currentImage = candidate;
					currentMediaType = candidateMediaType;
				}

				// If we exit loop without success, still emit completion
				enqueueFrame({ type: 'complete' });
			} catch (error) {
				enqueueFrame({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(customStream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
}