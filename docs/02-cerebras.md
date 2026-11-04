# Cerebras Streaming API

Cerebras exposes an OpenAI-compatible Chat Completions endpoint, so the `openai` SDK works with only a `baseURL` change.

- Base URL: `https://api.cerebras.ai/v1`
- Endpoint used: `chat.completions.create` with `stream: true`

## Setup

```ts
import { OpenAI } from "openai";

const client = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: "https://api.cerebras.ai/v1",
  // Only needed when running in a browser (as iter does):
  dangerouslyAllowBrowser: true,
});
```

## Basic streaming request

```ts
const stream = await client.chat.completions.create({
  model: "gpt-oss-120b",
  stream: true,
  stream_options: { include_usage: true }, // final chunk carries token usage
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ],
});

for await (const chunk of stream) {
  const text = chunk.choices.at(0)?.delta?.content;
  if (text) process.stdout.write(text);
}
```

Each `chunk` is a `ChatCompletionChunk`. The text increment is in `chunk.choices[0].delta.content` (it can be empty or missing, so guard for it).

## Request parameters

| Parameter                      | Notes                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| `model`                        | `gpt-oss-120b` or `qwen-3.8-27b`                            |
| `stream`                       | Must be `true` for streaming.                               |
| `stream_options.include_usage` | When `true`, the last chunk includes a `usage` object.      |
| `temperature`                  | 0 to 2.                                                     |
| `reasoning_effort`             | Model dependent (see below). Omit to use the model default. |
| `max_completion_tokens`        | Output token cap. Both models allow up to 40,000.           |
| `user`                         | Optional end-user identifier. iter sends `"iter"`.          |

### Supported models

| Model          | Max tokens | `reasoning_effort` values       |
| -------------- | ---------- | ------------------------------- |
| `gpt-oss-120b` | 40,000     | `low`, `medium`, `high`         |
| `qwen-3.8-27b` | 40,000     | `none`, `low`, `medium`, `high` |

## Usage and timing metadata

With `include_usage: true`, the chunk that has `chunk.usage` set reports:

- `usage.prompt_tokens_details?.cached_tokens`: input tokens served from cache
- `usage.completion_tokens`: output tokens

iter also measures timing on the client:

- **latency**: time from sending the request to the first non-empty content delta
- **duration**: time from sending the request to the chunk with usage

```ts
const start = performance.now();
let latencyMs: number | undefined;

for await (const chunk of stream) {
  const text = chunk.choices.at(0)?.delta?.content;
  if (text) {
    latencyMs ??= performance.now() - start;
    // handle text
  }
  if (chunk.usage) {
    console.log({
      cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
      totalOutputTokens: chunk.usage.completion_tokens,
      latencyMs,
      durationMs: performance.now() - start,
    });
  }
}
```

## Cancellation

Pass an `AbortSignal` as the second argument to `create`. Aborting it ends the stream and the `for await` loop throws an abort error.

```ts
const controller = new AbortController();

const stream = await client.chat.completions.create({ model: "gpt-oss-120b", stream: true, messages }, { signal: controller.signal });

// later
controller.abort();
```

## Message format

Messages use the standard OpenAI `ChatCompletionMessageParam` shape.

- **system**: plain string content.
- **user**: a string, or an array of parts:
  - text: `{ type: "text", text }`
  - image: `{ type: "image_url", image_url: { url } }` (data URLs work)
- **assistant**: a string, or an array of text parts.

iter's provider ([src/providers/cerebras.ts](../src/providers/cerebras.ts)) converts its internal messages like this:

- Plain text attachments with no filename become a text part.
- `image/*` attachments become an `image_url` part.
- Other attachments that decode as text are inlined as a fenced code block with the filename and media type in the info string. Anything else throws `Unsupported embedded message attachment`.

## How iter wraps it

`CerebrasProvider.getChatStreamProxy(connection)` returns an async generator. It takes `{ messages, abortSignal, ...config }`, yields each text delta as a string, and calls `config.onMetadata` when usage arrives.

- The `openai` SDK is loaded lazily with `await import("openai")`.
- `temperature` is only sent if the model's options define it.
- `reasoning_effort` defaults to the first value in the model's list. A configured value of `"default"` is treated as unset.
- `config.maxTokens` maps to `max_completion_tokens`.

## Complete example

```ts
import { OpenAI } from "openai";

async function* chat(prompt: string, signal?: AbortSignal) {
  const client = new OpenAI({
    apiKey: process.env.CEREBRAS_API_KEY,
    baseURL: "https://api.cerebras.ai/v1",
  });

  const stream = await client.chat.completions.create(
    {
      model: "gpt-oss-120b",
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "medium",
      max_completion_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    },
    { signal },
  );

  for await (const chunk of stream) {
    const text = chunk.choices.at(0)?.delta?.content;
    if (text) yield text;
  }
}

for await (const text of chat("Explain streaming in one paragraph.")) {
  process.stdout.write(text);
}
```
