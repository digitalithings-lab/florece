import { Injectable, Logger } from "@nestjs/common";
import webpush, { WebPushError } from "web-push";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // ruta del panel que se abre al tocar el aviso
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Avisos push del navegador (Web Push, sin Firebase) a los dispositivos del psicólogo. Nunca hace fallar la operación que lo llama.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {
    if (this.enabled) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  }

  get enabled() {
    return Boolean(config.push.publicKey && config.push.privateKey);
  }

  get publicKey() {
    return config.push.publicKey;
  }

  async subscribe(psychologistId: string, sub: PushSubscriptionInput) {
    const data = { psychologistId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
    await this.prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
  }

  async unsubscribe(psychologistId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { psychologistId, endpoint } });
  }

  devices(psychologistId: string) {
    return this.prisma.pushSubscription.count({ where: { psychologistId } });
  }

  // Devuelve a cuántos dispositivos llegó.
  async send(psychologistId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;
    const subs = await this.prisma.pushSubscription.findMany({ where: { psychologistId } });
    const body = JSON.stringify(payload);
    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
            TTL: 24 * 60 * 60,
            urgency: "high",
            timeout: 8_000,
          });
          return true;
        } catch (err) {
          // 404/410: el navegador anuló el permiso o la suscripción venció; se borra.
          if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.error(`No se pudo enviar el push: ${err instanceof Error ? err.message : err}`);
          }
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }
}
