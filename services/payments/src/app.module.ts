import { Module } from "@nestjs/common";
import { DbModule } from "./db.module";
import { PaymentsController } from "./payments.controller";
import { HealthController } from "./health.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [DbModule],
  controllers: [PaymentsController, HealthController],
  providers: [PaymentsService],
})
export class AppModule {}
