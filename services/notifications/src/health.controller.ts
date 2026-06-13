import { Controller, Get } from "@nestjs/common";
import { pingDb } from "@neet/db";
import { config, emailEnabled } from "./config";

@Controller()
export class HealthController {
  @Get("healthz")
  healthz() {
    return { status: "ok" };
  }

  @Get("readyz")
  async readyz() {
    const db = await pingDb(config.DATABASE_URL);
    return { status: db ? "ready" : "degraded", db, email: emailEnabled ? "resend" : "dev" };
  }
}
