import { Module } from "@nestjs/common";
import { DbModule } from "./db.module";
import { StudyController } from "./study.controller";
import { HealthController } from "./health.controller";
import { StudyService } from "./study.service";

@Module({
  imports: [DbModule],
  controllers: [StudyController, HealthController],
  providers: [StudyService],
})
export class AppModule {}
