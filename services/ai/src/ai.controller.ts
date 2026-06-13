import { Body, Controller, Headers, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ChatRequest } from "@neet/types";
import { claimsFromHeader } from "@neet/shared";
import { AiService } from "./ai.service";
import { config } from "./config";

@Controller("api/v1/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * AI Tutor — streams the answer as Server-Sent Events.
   *   data: {"type":"delta","text":"..."}
   *   data: {"type":"done","meta":{...}}
   * Authorization is optional: a valid Bearer token attributes the saved
   * conversation to that user; anonymous requests still work.
   */
  @Post("chat")
  async chat(
    @Body() body: unknown,
    @Res() res: Response,
    @Headers("authorization") authHeader?: string,
  ): Promise<void> {
    const parsed = ChatRequest.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        detail: parsed.error.flatten(),
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);

    try {
      for await (const event of this.ai.streamTutor(parsed.data, claims?.sub)) {
        send(event);
      }
    } catch (err) {
      send({ type: "error", message: (err as Error).message });
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}
