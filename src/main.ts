import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Vercel pone un proxy delante; sin esto el límite de peticiones vería a todos con la misma IP.
  app.set("trust proxy", 1);
  app.enableCors();
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  await app.listen(config.port, "0.0.0.0");
  Logger.log(`Florece backend escuchando en el puerto ${config.port}`, "Bootstrap");
}

bootstrap();
