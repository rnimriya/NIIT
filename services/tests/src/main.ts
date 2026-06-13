import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { runMigrations, createDb } from "@neet/db";
import { AppModule } from "./app.module";
import { config } from "./config";
import { seedIfEmpty } from "./seed";

async function bootstrap() {
  const log = new Logger("Bootstrap");

  try {
    await runMigrations(config.DATABASE_URL); // idempotent
    const seeded = await seedIfEmpty(createDb(config.DATABASE_URL));
    log.log(`migrations applied; question bank: ${seeded} questions`);
  } catch (e) {
    log.error(`startup failed: ${(e as Error).message}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  await app.listen(config.TESTS_PORT, "0.0.0.0");
  log.log(`Tests service listening on :${config.TESTS_PORT}`);
}

bootstrap();
