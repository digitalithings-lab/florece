import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CareLinkStatus, EmotionOption } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface EmotionInput {
  label: string;
  emoji: string;
  color: string;
}

@Injectable()
export class EmotionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista que ve una persona: la de su psicólogo si armó una; si no, la de por defecto.
  async optionsForUser(userId: string): Promise<EmotionOption[]> {
    const link = await this.prisma.careLink.findFirst({
      where: { patientId: userId, status: CareLinkStatus.ACTIVE },
      select: { psychologistId: true },
    });
    if (link) {
      const custom = await this.prisma.emotionOption.findMany({
        where: { psychologistId: link.psychologistId, active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (custom.length > 0) return custom;
    }
    return this.defaults();
  }

  defaults(includeInactive = false) {
    return this.prisma.emotionOption.findMany({
      where: { psychologistId: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  // ─── Lista propia del psicólogo ──────────────────────

  async forPsychologist(psychologistId: string) {
    const [custom, defaults] = await Promise.all([
      this.prisma.emotionOption.findMany({
        where: { psychologistId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.defaults(),
    ]);
    return {
      // Mientras no tenga emociones propias activas, sus pacientes ven la lista por defecto.
      usingDefaults: !custom.some((e) => e.active),
      custom: custom.map(format),
      defaults: defaults.map(format),
    };
  }

  async create(psychologistId: string, input: EmotionInput) {
    const last = await this.prisma.emotionOption.findFirst({ where: { psychologistId }, orderBy: { sortOrder: "desc" } });
    await this.prisma.emotionOption.create({
      data: { psychologistId, ...clean(input), sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return this.forPsychologist(psychologistId);
  }

  async update(psychologistId: string, id: string, input: Partial<EmotionInput> & { active?: boolean }) {
    await this.findOwned(psychologistId, id);
    await this.prisma.emotionOption.update({
      where: { id },
      data: {
        label: input.label?.trim(),
        emoji: input.emoji?.trim(),
        color: input.color?.toUpperCase(),
        active: input.active,
      },
    });
    return this.forPsychologist(psychologistId);
  }

  // Los registros que ya usaban esta emoción conservan su copia de nombre, emoji y color.
  async remove(psychologistId: string, id: string) {
    await this.findOwned(psychologistId, id);
    await this.prisma.emotionOption.delete({ where: { id } });
    return this.forPsychologist(psychologistId);
  }

  async reorder(psychologistId: string, ids: string[]) {
    const owned = await this.prisma.emotionOption.findMany({ where: { psychologistId }, select: { id: true } });
    const ownedIds = new Set(owned.map((o) => o.id));
    if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) {
      throw new BadRequestException("La lista para ordenar no coincide con tus emociones");
    }
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.emotionOption.update({ where: { id }, data: { sortOrder: index } })));
    return this.forPsychologist(psychologistId);
  }

  // Copia la lista por defecto como punto de partida para personalizarla.
  async copyDefaults(psychologistId: string) {
    const existing = await this.prisma.emotionOption.count({ where: { psychologistId } });
    if (existing > 0) throw new BadRequestException("Ya tienes una lista propia");
    const defaults = await this.defaults();
    await this.prisma.emotionOption.createMany({
      data: defaults.map((d, index) => ({ psychologistId, label: d.label, emoji: d.emoji, color: d.color, sortOrder: index })),
    });
    return this.forPsychologist(psychologistId);
  }

  private async findOwned(psychologistId: string, id: string) {
    const option = await this.prisma.emotionOption.findFirst({ where: { id, psychologistId } });
    if (!option) throw new NotFoundException("Esa emoción no existe en tu lista");
    return option;
  }
}

export function format(e: EmotionOption) {
  return { id: e.id, label: e.label, emoji: e.emoji, color: e.color, active: e.active, sortOrder: e.sortOrder };
}

function clean(input: EmotionInput) {
  return { label: input.label.trim(), emoji: input.emoji.trim(), color: input.color.toUpperCase() };
}
