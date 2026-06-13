import { Module } from "@nestjs/common";
import { DbModule } from "./db.module";
import { NotificationsController } from "./notifications.controller";
import { HealthController } from "./health.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [DbModule],
  controllers: [NotificationsController, HealthController],
  providers: [NotificationsService],
})
export class AppModule {}
