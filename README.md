## NanoAgent

### What this project does
**NanoAgent** is a small, production-ready Next.js app that showcases an AI image-editing agent. You can upload one or more images, describe the edit you want, and the agent will iteratively generate, normalize, and evaluate candidates until they match your prompt, preserving the subject’s identity. It also includes simple chat and image-generation APIs.

### Key features
- **Iterative image editing agent**: Generates candidates with Google Gemini, evaluates them automatically, and refines until acceptable
- **Identity preservation**: Prompts enforce keeping the main subject’s facial/structural identity
- **Streaming UI**: Real-time status, per-iteration images, and evaluator feedback rendered in `AgentPlayground`
- **Multiple providers**: Uses OpenAI, Google Generative AI, and FAL via a single provider registry
- **Clean API routes**: Minimal endpoints for chat, image generation, and the image-editing agent

### Tech stack
- **Web**: Next.js (App Router), React, TypeScript
- **AI SDK**: `ai` with provider adapters for OpenAI, Google, and FAL
- **Image processing**: `sharp` for normalization and PNG output
- **UI**: Modular components in `components/` with utility-first styling

## Architecture overview

### Directories
- `app/` – Next.js App Router pages and API routes
  - `app/api/ai/chat/route.ts` – streaming chat endpoint
  - `app/api/ai/image/route.ts` – image generation endpoint
  - `app/api/ai/agent/image-edit/route.ts` – iterative image-editing agent (streams AI SDK frames)
- `components/` – UI and AI element primitives; `AgentPlayground` composes the demo UI
- `lib/ai/providers.ts` – centralized provider registry and default model IDs
- `hooks/` – shared hooks

### Data flow (image-editing agent)
1) Client uploads images and a prompt from `AgentPlayground`
2) Server normalizes input images with `sharp` and kicks off an iterative loop
3) Each iteration:
   - Generate candidate using `google:gemini-2.5-flash-image-preview`
   - Normalize the output, emit a base64 frame to the client
   - Evaluate with `google:gemini-2.5-flash` against the original(s) and prompt
   - Continue until accepted or iteration limit
4) Stream ends with a `complete` frame

## Getting started

### Prerequisites
- Node.js 18+ (Edge runtime is used by several routes)
- Package manager: pnpm (recommended), npm, yarn, or bun

### Install
```bash
pnpm install
```

### Environment variables
Create a `.env.local` at the project root with the following keys:
```bash
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
FAL_KEY=...
```

Defaults are configured in `lib/ai/providers.ts`:
- `defaultChatModelId`: `openai:gpt-4o-mini`
- `defaultImageModelId`: `fal-ai/gemini-25-flash-image/edit`
- Gemini vision models used by the agent for generation and evaluation

### Run the dev server
```bash
pnpm dev
```

Open `http://localhost:3000` and try the image-editing agent UI on the home page.

## API reference

### POST `/api/ai/agent/image-edit`
Iterative image-editing agent. Returns a newline-delimited text stream where each line begins with `0:` followed by a JSON frame.

Request (multipart/form-data):
- `prompt`: string (required)
- `image`: one or more image files (required)
- `maxIterations`: number (optional, default up to 10–12)

Example (streaming with curl):
```bash
curl -N -X POST \
  -F "prompt=Make lighting warmer and add soft film grain" \
  -F "image=@/path/to/photo.png" \
  http://localhost:3000/api/ai/agent/image-edit
```

Frames may include:
- `{ type: "status", message }`
- `{ type: "image", iteration, base64, mediaType }`
- `{ type: "evaluation", iteration, feedback, isAcceptable }`
- `{ type: "complete" }`
- `{ type: "error", message }`

### POST `/api/ai/image`
Generate a single image using FAL.

Request (JSON):
```json
{ "prompt": "a cozy reading nook, warm morning light" }
```

Response: binary PNG image.

Example:
```bash
curl -X POST http://localhost:3000/api/ai/image \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a cozy reading nook, warm morning light"}' \
  --output out.png
```

### POST `/api/ai/chat`
Streaming chat using the default or requested model.

Request (JSON):
```json
{
  "messages": [
    { "role": "user", "content": "Write a haiku about the sea" }
  ],
  "model": "openai:gpt-4o-mini"
}
```

Response: text/event-stream compatible text stream from the AI SDK.

## Frontend
- `app/page.tsx` renders `AgentPlayground`, a focused UI for uploading images, composing a prompt, and viewing per-iteration results and evaluator feedback in real time.
- Components live under `components/` and are organized for reuse and clarity.

## Development notes
- Follow React/Next.js best practices and type safety; avoid `any`.
- Keep provider usage centralized in `lib/ai/providers.ts`.
- Avoid unnecessary client components; keep server/edge defaults on API routes.

## License
MIT (or your preferred license).
