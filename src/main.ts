import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Vercel pone un proxy delante; sin esto el límite de peticiones vería a todos con la misma IP.
  app.set("trust proxy", 1);
  // Cabeceras de seguridad (la API solo entrega JSON). "cross-origin" permite que el panel y la web carguen sus respuestas.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // CORS: solo los sitios conocidos pueden llamar a la API desde un navegador. La app móvil, el CRM (servidor a servidor)
  // y herramientas como curl no envían Origin y siguen funcionando. Para añadir otro sitio: CORS_ORIGINS="https://a.com,https://b.com".
  // CORS_ORIGINS="*" lo deja abierto como antes.
  const extra = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const known = [config.mail.siteUrl, config.mail.siteUrl.replace("://", "://www."), "https://espaciovitalpsic.site", "https://www.espaciovitalpsic.site", "https://florece-digitali3.vercel.app"];
  const allowed = new Set([...known, ...extra].map((o) => o.replace(/\/+$/, "")));
  const patterns = [
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    /^https:\/\/[a-z0-9-]*(florece|psicodash|crmespacio|espaciovital|digitali)[a-z0-9-]*\.vercel\.app$/, // panel, CRM y versiones de prueba
  ];
  const cors = new Logger("CORS");
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || extra.includes("*") || allowed.has(origin) || patterns.some((p) => p.test(origin))) return callback(null, true);
      cors.warn(`Origen no permitido: ${origin} (añádelo en CORS_ORIGINS si es tuyo)`);
      return callback(null, false);
    },
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  await app.listen(config.port, "0.0.0.0");
  Logger.log(`Florece backend escuchando en el puerto ${config.port}`, "Bootstrap");
}

bootstrap();
