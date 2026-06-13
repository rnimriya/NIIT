import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { runMigrations, createDb } from "@neet/db";
import { EventBus, kafkaBrokers } from "@neet/events";
import { AppModule } from "./app.module";
import { config } from "./config";
import { seedIfEmpty } from "./seed";
import { OutboxRelay } from "./outbox-relay";

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

  // Outbox relay: publish committed events to Kafka (when enabled).
  const brokers = kafkaBrokers();
  if (brokers) {
    const bus = new EventBus(brokers, "tests-relay");
    try {
      await bus.waitReady();
      await bus.ensureTopics(["assessment.events"]);
      await new OutboxRelay(createDb(config.DATABASE_URL), bus).start();
    } catch (e) {
      log.error(`outbox relay failed to start: ${(e as Error).message}`);
    }
  }
}

bootstrap();
