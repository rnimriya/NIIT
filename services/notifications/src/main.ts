import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { runMigrations } from "@neet/db";
import { EventBus, kafkaBrokers, ASSESSMENT_TOPIC } from "@neet/events";
import { AppModule } from "./app.module";
import { NotificationsService } from "./notifications.service";
import { config } from "./config";

async function bootstrap() {
  const log = new Logger("Bootstrap");
  try {
    await runMigrations(config.DATABASE_URL); // idempotent
  } catch (e) {
    log.error(`migration failed: ${(e as Error).message}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  await app.listen(config.NOTIFICATIONS_PORT, "0.0.0.0");
  log.log(`Notifications service listening on :${config.NOTIFICATIONS_PORT}`);

  // Event consumer: react to assessment events (when Kafka is enabled).
  const brokers = kafkaBrokers();
  if (brokers) {
    const bus = new EventBus(brokers, "notifications");
    const notifications = app.get(NotificationsService);
    try {
      await bus.waitReady();
      await bus.ensureTopics([ASSESSMENT_TOPIC]);
      await bus.consume("notifications", [ASSESSMENT_TOPIC], async (event) => {
        if (event.type === "TestScored" && event.actor) {
          const p = event.payload as { score: number; maxScore: number; correct: number; wrong: number };
          await notifications.emit({
            userId: event.actor,
            type: "test_scored",
            title: `Diagnostic scored: ${p.score}/${p.maxScore}`,
            body: `You got ${p.correct} right, ${p.wrong} wrong. Generate a study plan to target your weak areas.`,
            dedupeWindowSec: 5,
          });
        }
      });
      log.log("subscribed to assessment.events");
    } catch (e) {
      log.error(`kafka consumer failed: ${(e as Error).message}`);
    }
  }
}

bootstrap();
