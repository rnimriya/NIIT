import { Controller, Get } from "@nestjs/common";
import { hasAnthropic, hasOpenAI } from "./config";

@Controller()
export class HealthController {
  @Get("healthz")
  healthz() {
    return { status: "ok" };
  }

  @Get("readyz")
  readyz() {
    return {
      status: "ready",
      ai: {
        anthropic: hasAnthropic,
        openai: hasOpenAI,
        mode: hasAnthropic ? "claude" : hasOpenAI ? "openai" : "mock",
      },
    };
  }
}
