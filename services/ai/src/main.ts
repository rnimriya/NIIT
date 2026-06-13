import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // graceful shutdown — drain in-flight requests on SIGTERM/SIGINT
  app.enableShutdownHooks();

  await app.listen(config.AI_PORT, "0.0.0.0");
  new Logger("Bootstrap").log(
    `AI gateway listening on :${config.AI_PORT} (mode: ${
      config.ANTHROPIC_API_KEY ? "claude" : config.OPENAI_API_KEY ? "openai" : "mock"
    })`,
  );
}

bootstrap();
