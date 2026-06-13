import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { runMigrations } from "@neet/db";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const log = new Logger("Bootstrap");
  try {
    await runMigrations(config.DATABASE_URL); // idempotent
  } catch (e) {
    log.error(`migration failed: ${(e as Error).message}`);
    process.exit(1);
  }

  // rawBody required for Stripe webhook signature verification
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  app.enableShutdownHooks();
  await app.listen(config.PAYMENTS_PORT, "0.0.0.0");
  log.log(`Payments service listening on :${config.PAYMENTS_PORT}`);
}

bootstrap();
