import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createDb, conversations, messages, type Database } from "@neet/db";
import type { ChatRequest, ChatStreamEvent, ChatMeta } from "@neet/types";
import { hasAnthropic, hasOpenAI, persistEnabled, databaseUrl } from "./config";
import { SYLLABUS_SYSTEM_PREFIX, buildUserContent } from "./prompts";

const CLAUDE_HARD = "claude-opus-4-8";
const CLAUDE_DEFAULT = "claude-sonnet-4-6";

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private readonly anthropic = hasAnthropic ? new Anthropic() : null;
  private readonly openai = hasOpenAI ? new OpenAI() : null;
  private readonly db: Database | null =
    persistEnabled && databaseUrl ? createDb(databaseUrl) : null;

  /**
   * Public entry: streams the tutor answer AND persists the turn (best-effort).
   * Accumulates deltas so the full answer + meta can be saved after the stream.
   */
  async *streamTutor(
    req: ChatRequest,
    userId?: string,
  ): AsyncGenerator<ChatStreamEvent> {
    let full = "";
    let meta: ChatMeta | undefined;

    for await (const event of this.run(req)) {
      if (event.type === "delta") full += event.text;
      if (event.type === "done") meta = event.meta;
      yield event;
    }

    if (this.db && meta) {
      this.persist(userId, req.question, full, meta).catch((e) =>
        this.log.warn(`persist failed: ${(e as Error).message}`),
      );
    }
  }

  /** Fallback chain: Claude → OpenAI → deterministic mock. */
  private async *run(req: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const started = Date.now();

    if (this.anthropic) {
      try {
        yield* this.viaClaude(req, started);
        return;
      } catch (err) {
        this.log.error(`Claude failed, falling back: ${(err as Error).message}`);
      }
    }
    if (this.openai) {
      try {
        yield* this.viaOpenAI(req, started);
        return;
      } catch (err) {
        this.log.error(`OpenAI failed, falling back: ${(err as Error).message}`);
      }
    }
    yield* this.viaMock(req, started);
  }

  private async persist(
    userId: string | undefined,
    question: string,
    answer: string,
    meta: ChatMeta,
  ): Promise<void> {
    await this.db!.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({ userId: userId ?? null, title: question.slice(0, 80) })
        .returning();
      await tx.insert(messages).values([
        { conversationId: conv.id, role: "user", content: question },
        { conversationId: conv.id, role: "assistant", content: answer, meta },
      ]);
    });
  }

  private async *viaClaude(
    req: ChatRequest,
    started: number,
  ): AsyncGenerator<ChatStreamEvent> {
    const model = req.hard ? CLAUDE_HARD : CLAUDE_DEFAULT;
    // Typed permissively: the installed SDK may predate `output_config` /
    // `cache_control` / adaptive thinking, but the SDK forwards these fields
    // to the API at runtime.
    const params: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: req.hard ? "high" : "medium" },
      // STABLE prefix cached for 1h → big input-token savings on repeat calls.
      system: [
        {
          type: "text",
          text: SYLLABUS_SYSTEM_PREFIX,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildUserContent({ question: req.question, subject: req.subject }),
        },
      ],
    };
    const stream = this.anthropic!.messages.stream(params as any);

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "delta", text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    if ((final.stop_reason as string) === "refusal") {
      throw new Error("refusal"); // bubble to fallback chain
    }
    const u = final.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
    };
    yield {
      type: "done",
      meta: {
        model,
        provider: "anthropic",
        fallbackUsed: false,
        cacheRead: u.cache_read_input_tokens ?? 0,
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  private async *viaOpenAI(
    req: ChatRequest,
    started: number,
  ): AsyncGenerator<ChatStreamEvent> {
    const model = "gpt-4o";
    const stream = await this.openai!.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: SYLLABUS_SYSTEM_PREFIX },
        {
          role: "user",
          content: buildUserContent({ question: req.question, subject: req.subject }),
        },
      ],
    });

    let inputTokens = 0;
    let outputTokens = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { type: "delta", text: delta };
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    yield {
      type: "done",
      meta: {
        model,
        provider: "openai",
        fallbackUsed: true,
        cacheRead: 0,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
      },
    };
  }

  /** Deterministic offline tutor so the slice boots with zero API keys. */
  private async *viaMock(
    req: ChatRequest,
    started: number,
  ): AsyncGenerator<ChatStreamEvent> {
    const answer =
      `**Concept.** Let's work through "${req.question.slice(0, 120)}".\n\n` +
      `**Step 1.** Identify what NEET tests here — recall the relevant NCERT principle.\n` +
      `**Step 2.** Set up the relation / equation for the given quantities.\n` +
      `**Step 3.** Substitute values with units and simplify.\n\n` +
      `**Answer.** (Set ANTHROPIC_API_KEY to get a full Claude-generated solution.)\n\n` +
      `*Revision tip:* practise 3 similar problems from this chapter to lock it in.`;

    for (const token of answer.match(/\S+\s*/g) ?? []) {
      yield { type: "delta", text: token };
      await new Promise((r) => setTimeout(r, 12));
    }

    yield {
      type: "done",
      meta: {
        model: "mock-tutor",
        provider: "mock",
        fallbackUsed: true,
        cacheRead: 0,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
      },
    };
  }
}
