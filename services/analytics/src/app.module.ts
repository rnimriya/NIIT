import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { HealthController } from "./health.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  controllers: [AnalyticsController, HealthController],
  providers: [AnalyticsService],
})
export class AppModule {}
