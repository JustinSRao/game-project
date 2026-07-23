import { z } from "zod";
import type { ModelClient, TextRequest } from "./modelClient.js";

/**
 * Prose from a model, arriving as it is written when the adapter can do that
 * and in one piece when it cannot.
 *
 * The fallback is the point: `streamText` is optional on ModelClient, so every
 * caller would otherwise need a branch, and the fake clients in tests would
 * need to grow a streaming implementation to be usable at all. Instead the
 * fallback goes through `generateStructured`, which every client already has,
 * and yields the whole thing as a single chunk — the same text, less
 * gracefully delivered.
 */
const ProseOutput = z.object({ text: z.string().min(1).max(4000) });

export async function* streamProse(
  model: ModelClient,
  req: TextRequest,
): AsyncIterable<string> {
  if (model.streamText) {
    yield* model.streamText(req);
    return;
  }
  const out = await model.generateStructured({
    role: req.role,
    system: `${req.system}\n\nOutput an object {"text": "<the prose>"}.`,
    user: req.user,
    schema: ProseOutput,
  });
  yield out.text;
}

/**
 * Drain a prose stream, forwarding each chunk to `onChunk` and returning the
 * whole. Callers that only want the finished text still get the streaming
 * behaviour for free by passing a callback that forwards to the client.
 */
export async function collectProse(
  chunks: AsyncIterable<string>,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  let text = "";
  for await (const chunk of chunks) {
    text += chunk;
    onChunk?.(chunk);
  }
  return text;
}
