import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ChatRequest } from "@neet/types";
import { AiService } from "./ai.service";

@Controller("api/v1/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * AI Tutor — streams the answer as Server-Sent Events.
   *   data: {"type":"delta","text":"..."}
   *   data: {"type":"done","meta":{...}}
   */
  @Post("chat")
  async chat(@Body() body: unknown, @Res() res: Response): Promise<void> {
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

    try {
      for await (const event of this.ai.streamTutor(parsed.data)) {
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
