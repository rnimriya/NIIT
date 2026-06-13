import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { PlanController } from "./plan.controller";
import { AiService } from "./ai.service";
import { HealthController } from "./health.controller";

@Module({
  controllers: [AiController, PlanController, HealthController],
  providers: [AiService],
})
export class AppModule {}
