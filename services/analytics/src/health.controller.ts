import { Controller, Get } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { clickhouseEnabled } from "./config";

@Controller()
export class HealthController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("healthz")
  healthz() {
    return { status: "ok" };
  }

  @Get("readyz")
  async readyz() {
    const ch = await this.analytics.ready();
    return { status: "ready", clickhouse: clickhouseEnabled ? (ch ? "up" : "down") : "disabled" };
  }
}
