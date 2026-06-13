import { Body, Controller, Get, Post } from "@nestjs/common";
import { z } from "zod";
import { AnalyticsService } from "./analytics.service";

const TrackDto = z.object({
  type: z.string().min(1).max(64),
  actor: z.string().optional(),
  source: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

@Controller("api/v1/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Record a client/service event. */
  @Post("track")
  async track(@Body() body: unknown) {
    const dto = TrackDto.parse(body);
    await this.analytics.track(dto);
    return { ok: true };
  }

  /** Event counts by type. */
  @Get("overview")
  overview() {
    return this.analytics.overview();
  }

  /** Ordered acquisition → activation funnel. */
  @Get("funnel")
  funnel() {
    return this.analytics.funnel();
  }
}
