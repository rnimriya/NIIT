import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { runMigrations } from "@neet/db";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const log = new Logger("Bootstrap");

  // auth owns the users schema → it runs migrations on boot (idempotent).
  try {
    await runMigrations(config.DATABASE_URL);
    log.log("migrations applied");
  } catch (e) {
    log.error(`migration failed: ${(e as Error).message}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  await app.listen(config.AUTH_PORT, "0.0.0.0");
  log.log(`Auth service listening on :${config.AUTH_PORT}`);
}

bootstrap();
