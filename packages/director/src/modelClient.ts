import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { RoleConfig } from "./config.js";
import { recordUsage, roleNameOf } from "./costs.js";

/**
 * The seam between the Director and the Claude API. Everything above this
 * interface is testable with a fake; everything below it is a thin adapter.
 */
export interface StructuredRequest<T> {
  role: RoleConfig;
  /** Frozen system prompt — first for prefix stability (prompt caching). */
  system: string;
  /** The per-turn user content. Stable parts first, volatile parts last. */
  user: string;
  /** Validation-error feedback appended on regeneration attempts. */
  feedback?: readonly string[];
  /** Output-typed schema; input side is unconstrained (defaults, coercion). */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}

/**
 * A prose request. Deliberately separate from StructuredRequest: this is the
 * one place the Director wants text rather than data, and it exists so prose
 * the player reads can arrive while it is being written (Phase 6 latency).
 * Nothing authored through here may become game state — that would break the
 * data-not-code rule (ADR-0001). It is narration, and narration only.
 */
export interface TextRequest {
  role: RoleConfig;
  /** Frozen system prompt — first for prefix stability (prompt caching). */
  system: string;
  /** The per-turn user content. Stable parts first, volatile parts last. */
  user: string;
}

export interface ModelClient {
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;
  /**
   * Stream prose as the model writes it. Optional: an adapter that cannot
   * stream simply omits it, and `streamProse` (streaming.ts) falls back to a
   * single structured call — so no caller has to branch on provider support.
   */
  streamText?(req: TextRequest): AsyncIterable<string>;
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/** Real adapter over the Claude API. Requires ANTHROPIC_API_KEY (server-side only). */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic();
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: req.user },
    ];
    for (const f of req.feedback ?? []) {
      messages.push({ role: "user", content: f });
    }
    // zodOutputFormat's typings target zod v4's interface; our schemas use the
    // classic v3 API of the same package. Cast at this one boundary and
    // re-validate the result with the caller's schema (which the retry loop
    // relies on anyway).
    const format = zodOutputFormat(req.schema as never);
    const response = await this.client.messages.parse({
      model: req.role.model,
      max_tokens: req.role.maxTokens,
      // cache_control on the frozen system prompt: tools+system cache together
      system: [
        {
          type: "text",
          text: req.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      ...(req.role.adaptiveThinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: {
        format,
        ...(req.role.effort ? { effort: req.role.effort } : {}),
      },
      messages,
    });
    // Cost ledger (ADR-0018): every call is recorded, tokens as ground truth.
    recordUsage({
      provider: "anthropic",
      model: req.role.model,
      role: roleNameOf(req.role),
      kind: "text",
      inputTokens: response.usage.input_tokens,
      cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      outputTokens: response.usage.output_tokens,
    });

    const parsed: unknown = (response as { parsed_output?: unknown }).parsed_output;
    if (parsed == null) {
      throw new ModelOutputError(
        `model returned no parseable output (stop_reason: ${response.stop_reason})`,
      );
    }
    return req.schema.parse(parsed);
  }

  async *streamText(req: TextRequest): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: req.role.model,
      max_tokens: req.role.maxTokens,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta" &&
        event.delta.text
      ) {
        yield event.delta.text;
      }
    }

    // Recorded after the stream drains, where the usage totals are final —
    // but unconditionally, because a call that streamed and then failed still
    // cost money (ADR-0018).
    const final = await stream.finalMessage();
    recordUsage({
      provider: "anthropic",
      model: req.role.model,
      role: roleNameOf(req.role),
      kind: "text",
      inputTokens: final.usage.input_tokens,
      cachedInputTokens: final.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
      outputTokens: final.usage.output_tokens,
    });
  }
}
