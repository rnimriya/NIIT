import { Module } from "@nestjs/common";
import { DbModule } from "./db.module";
import { TestsController } from "./tests.controller";
import { MasteryController } from "./mastery.controller";
import { HealthController } from "./health.controller";
import { TestsService } from "./tests.service";

@Module({
  imports: [DbModule],
  controllers: [TestsController, MasteryController, HealthController],
  providers: [TestsService],
})
export class AppModule {}
