import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { runMigrations } from "@neet/db";
import { EventBus, kafkaBrokers, ASSESSMENT_TOPIC } from "@neet/events";
import { AppModule } from "./app.module";
import { PredictionService } from "./prediction.service";
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
  await app.listen(config.PREDICTION_PORT, "0.0.0.0");
  log.log(`Prediction service listening on :${config.PREDICTION_PORT}`);

  // Event consumer: recompute the prediction whenever mastery changes.
  const brokers = kafkaBrokers();
  if (brokers) {
    const bus = new EventBus(brokers, "prediction");
    const prediction = app.get(PredictionService);
    try {
      await bus.waitReady();
      await bus.ensureTopics([ASSESSMENT_TOPIC]);
      await bus.consume("prediction", [ASSESSMENT_TOPIC], async (event) => {
        if (event.type === "TestScored" && event.actor) {
          await prediction.compute(event.actor);
        }
      });
      log.log("subscribed to assessment.events");
    } catch (e) {
      log.error(`kafka consumer failed: ${(e as Error).message}`);
    }
  }
}

bootstrap();
