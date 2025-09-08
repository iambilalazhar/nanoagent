import { createProviderRegistry } from 'ai';
import { openai as defaultOpenAI, createOpenAI } from '@ai-sdk/openai';
import { fal as defaultFal, createFal } from '@ai-sdk/fal';
import { google as defaultGoogle, createGoogleGenerativeAI } from '@ai-sdk/google';

// Centralized AI providers configuration.
// Uses environment variables by default:
// - OPENAI_API_KEY for OpenAI
// - FAL_KEY for FAL

export const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export const fal = createFal({
	apiKey: process.env.FAL_KEY,
});

export const google = createGoogleGenerativeAI({
	apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Provider registry allows selecting models via "provider:model" strings
export const aiProviders = createProviderRegistry({
	openai: openai ?? defaultOpenAI,
	fal: fal ?? defaultFal,
	google: google ?? defaultGoogle,
});

// Sensible defaults. Override per request if needed.
export type ProviderModelId = `openai:${string}` | `fal:${string}` | `google:${string}`;
export const defaultChatModelId: ProviderModelId = 'openai:gpt-4o-mini';
export const defaultImageModelId = 'fal-ai/gemini-25-flash-image/edit';

// Google-centric defaults for agents using Gemini
export const defaultGeminiVisionModelId: ProviderModelId = 'google:gemini-2.5-flash';
export const defaultGeminiVisionImageOutputModelId: ProviderModelId = 'google:gemini-2.5-flash-image-preview';


