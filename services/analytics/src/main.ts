import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { EventBus, kafkaBrokers, ASSESSMENT_TOPIC } from "@neet/events";
import { AppModule } from "./app.module";
import { AnalyticsService } from "./analytics.service";
import { config } from "./config";

async function bootstrap() {
  const log = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  await app.listen(config.ANALYTICS_PORT, "0.0.0.0");
  log.log(`Analytics service listening on :${config.ANALYTICS_PORT}`);

  // Event sink: consume the assessment stream into ClickHouse (when enabled).
  const brokers = kafkaBrokers();
  if (brokers) {
    const bus = new EventBus(brokers, "analytics");
    const analytics = app.get(AnalyticsService);
    try {
      await bus.waitReady();
      await bus.ensureTopics([ASSESSMENT_TOPIC]);
      await bus.consume("analytics", [ASSESSMENT_TOPIC], async (event) => {
        await analytics.ingestEvent(event);
      });
      log.log("subscribed to assessment.events");
    } catch (e) {
      log.error(`kafka consumer failed: ${(e as Error).message}`);
    }
  }
}

bootstrap();
