import { Injectable, NotFoundException } from "@nestjs/common";
import { CareLinkStatus, UserRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { ACTIVE_APPOINTMENT } from "../care/care.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChallengeDto, CrisisResourceDto, UpdateChallengeDto, UpdatePsychologistStatusDto } from "./dto/admin.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [patients, psychologists, linkedPatients, upcomingAppointments, pendingRiskEvents, activeToday] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.USER, deletedAt: null } }),
      this.prisma.psychologist.count(),
      this.prisma.careLink.count({ where: { status: CareLinkStatus.ACTIVE } }),
      this.prisma.appointment.count({ where: { status: { in: ACTIVE_APPOINTMENT }, startsAt: { gt: new Date() } } }),
      this.prisma.riskEvent.count({ where: { reviewedAt: null } }),
      this.prisma.dailyChallenge.groupBy({
        by: ["userId"],
        where: { completedAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
    ]);
    return { patients, psychologists, linkedPatients, upcomingAppointments, pendingRiskEvents, activeLast24h: activeToday.length };
  }

  // ─── Psicólogos ──────────────────────────────────────

  async psychologists() {
    const list = await this.prisma.psychologist.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        _count: { select: { careLinks: { where: { status: CareLinkStatus.ACTIVE } } } },
      },
    });
    return list.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      email: p.user.email,
      licenseNumber: p.licenseNumber,
      specialties: p.specialties,
      active: p.active,
      verified: p.verifiedAt !== null,
      activePatients: p._count.careLinks,
      createdAt: p.createdAt,
    }));
  }

  async updatePsychologist(id: string, dto: UpdatePsychologistStatusDto) {
    const psychologist = await this.prisma.psychologist.findUnique({ where: { id } });
    if (!psychologist) throw new NotFoundException("El psicólogo no existe");
    await this.prisma.psychologist.update({
      where: { id },
      data: {
        active: dto.active,
        verifiedAt: dto.verified === undefined ? undefined : dto.verified ? (psychologist.verifiedAt ?? new Date()) : null,
      },
    });
    return this.psychologists();
  }

  // ─── Catálogo general de retos ───────────────────────

  challenges() {
    return this.prisma.challenge.findMany({ orderBy: [{ active: "desc" }, { category: "asc" }, { title: "asc" }] });
  }

  createChallenge(dto: ChallengeDto) {
    return this.prisma.challenge.create({
      data: { ...dto, slug: `${slugify(dto.title)}-${randomBytes(2).toString("hex")}`, reflectionPrompt: dto.reflectionPrompt || null },
    });
  }

  async updateChallenge(id: string, dto: UpdateChallengeDto) {
    await this.findOrFail(this.prisma.challenge.findUnique({ where: { id } }), "El reto no existe");
    return this.prisma.challenge.update({ where: { id }, data: dto });
  }

  // ─── Líneas de ayuda en crisis ───────────────────────

  crisisResources() {
    return this.prisma.crisisResource.findMany({ orderBy: [{ countryCode: "asc" }, { sortOrder: "asc" }] });
  }

  createCrisisResource(dto: CrisisResourceDto) {
    return this.prisma.crisisResource.create({ data: { ...dto, url: dto.url || null } });
  }

  async updateCrisisResource(id: string, dto: Partial<CrisisResourceDto>) {
    await this.findOrFail(this.prisma.crisisResource.findUnique({ where: { id } }), "La línea de ayuda no existe");
    return this.prisma.crisisResource.update({ where: { id }, data: { ...dto, url: dto.url === "" ? null : dto.url } });
  }

  async deleteCrisisResource(id: string) {
    await this.prisma.crisisResource.deleteMany({ where: { id } });
  }

  // ─── Alertas de riesgo (sin contenido) ───────────────

  async riskEvents(onlyPending: boolean) {
    const events = await this.prisma.riskEvent.findMany({
      where: onlyPending ? { reviewedAt: null } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { profile: { select: { displayName: true, countryCode: true } } } } },
    });
    return events.map((e) => ({
      id: e.id,
      userId: e.userId,
      displayName: e.user.profile?.displayName ?? null,
      countryCode: e.user.profile?.countryCode ?? null,
      source: e.source,
      level: e.level,
      actionTaken: e.actionTaken,
      createdAt: e.createdAt,
      reviewedAt: e.reviewedAt,
      notes: e.notes,
    }));
  }

  async reviewRiskEvent(adminId: string, id: string, notes?: string) {
    await this.findOrFail(this.prisma.riskEvent.findUnique({ where: { id } }), "La alerta no existe");
    await this.prisma.riskEvent.update({ where: { id }, data: { reviewedAt: new Date(), reviewedById: adminId, notes: notes?.trim() || null } });
    return this.riskEvents(true);
  }

  private async findOrFail<T>(query: Promise<T | null>, message: string): Promise<T> {
    const found = await query;
    if (!found) throw new NotFoundException(message);
    return found;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
