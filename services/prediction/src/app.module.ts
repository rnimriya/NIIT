import { Module } from "@nestjs/common";
import { DbModule } from "./db.module";
import { PredictionController } from "./prediction.controller";
import { HealthController } from "./health.controller";
import { PredictionService } from "./prediction.service";

@Module({
  imports: [DbModule],
  controllers: [PredictionController, HealthController],
  providers: [PredictionService],
})
export class AppModule {}
