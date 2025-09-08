import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { aiProviders, defaultChatModelId, ProviderModelId } from '@/lib/ai/providers';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
	const body = await req.json().catch(() => ({}));
	const { messages, model } = body ?? {};

	const modelId: ProviderModelId =
		typeof model === 'string' && (model.startsWith('openai:') || model.startsWith('fal:') || model.startsWith('google:'))
			? (model as ProviderModelId)
			: defaultChatModelId;

	const resolvedModel = aiProviders.languageModel(modelId);

	const result = streamText({
		model: resolvedModel,
		messages: Array.isArray(messages) ? messages : [],
	});

	return result.toTextStreamResponse();
}


