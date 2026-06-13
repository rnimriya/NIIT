import { Module } from "@nestjs/common";
import { DbModule } from "./db.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { HealthController } from "./health.controller";

@Module({
  imports: [DbModule],
  controllers: [AuthController, HealthController],
  providers: [AuthService],
})
export class AppModule {}
