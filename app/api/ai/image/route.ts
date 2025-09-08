import { NextRequest, NextResponse } from 'next/server';
import { experimental_generateImage as generateImage } from 'ai';
import { fal, defaultImageModelId } from '@/lib/ai/providers';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
	const body = await req.json().catch(() => ({}));
	const { prompt, model } = body ?? {};
	if (typeof prompt !== 'string' || prompt.trim().length === 0) {
		return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
	}

	const modelId = typeof model === 'string' && model.length > 0 ? model : defaultImageModelId;

	const { image } = await generateImage({
		model: fal.image(modelId),
		prompt,
	});

	return new NextResponse(Buffer.from(image.uint8Array), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'no-store',
		},
	});
}


