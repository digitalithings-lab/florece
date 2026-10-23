import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConsentType } from "@prisma/client";
import { effectivePlan } from "../common/access";
import { isValidTimezone } from "../common/dates";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { AvatarDto, OnboardingDto, UpdateProfileDto } from "./dto/profile.dto";

// Estos consentimientos son condición para tener cuenta; para retirarlos hay que borrarla.
const MANDATORY_CONSENTS: ConsentType[] = [ConsentType.TERMS, ConsentType.PRIVACY, ConsentType.SENSITIVE_DATA];

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { user: { include: { avatar: true, consents: { where: { revokedAt: null } } } } },
    });
    if (!profile) {
      throw new NotFoundException("El perfil no existe");
    }

    const { avatar, consents } = profile.user;
    return {
      displayName: profile.displayName,
      focusAreas: profile.focusAreas,
      plan: effectivePlan(profile),
      premiumUntil: profile.premiumUntil,
      seedsBalance: profile.seedsBalance,
      timezone: profile.timezone,
      countryCode: profile.countryCode,
      onboardingCompleted: profile.onboardingCompletedAt !== null,
      avatar: avatar && { species: avatar.species, name: avatar.name, color: avatar.color },
      consents: consents.map((c) => ({ type: c.type, version: c.version, acceptedAt: c.acceptedAt })),
    };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw new BadRequestException("La zona horaria no es válida");
    }
    await this.prisma.profile.update({
      where: { userId },
      data: {
        displayName: dto.displayName?.trim(),
        focusAreas: dto.focusAreas,
        timezone: dto.timezone,
        countryCode: dto.countryCode,
      },
    });
    return this.get(userId);
  }

  async completeOnboarding(userId: string, dto: OnboardingDto) {
    await this.prisma.$transaction([
      this.prisma.profile.update({
        where: { userId },
        data: { focusAreas: dto.focusAreas, onboardingCompletedAt: new Date() },
      }),
      this.upsertAvatarQuery(userId, dto.avatar),
    ]);
    return this.get(userId);
  }

  async setAvatar(userId: string, dto: AvatarDto) {
    await this.upsertAvatarQuery(userId, dto);
    return this.get(userId);
  }

  async acceptConsent(userId: string, type: ConsentType) {
    const existing = await this.prisma.consent.findFirst({ where: { userId, type, revokedAt: null } });
    if (!existing) {
      await this.prisma.consent.create({ data: { userId, type, version: config.consentVersion } });
    }
    return this.get(userId);
  }

  async revokeConsent(userId: string, type: ConsentType) {
    if (MANDATORY_CONSENTS.includes(type)) {
      throw new BadRequestException("Este consentimiento es obligatorio; para retirarlo hay que eliminar la cuenta");
    }
    await this.prisma.consent.updateMany({
      where: { userId, type, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.get(userId);
  }

  async seeds(userId: string) {
    const [profile, transactions] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId }, select: { seedsBalance: true } }),
      this.prisma.seedTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, amount: true, reason: true, createdAt: true },
      }),
    ]);
    return { balance: profile.seedsBalance, transactions };
  }

  private upsertAvatarQuery(userId: string, dto: AvatarDto) {
    const data = { species: dto.species, name: dto.name.trim(), color: dto.color ?? null };
    return this.prisma.avatar.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
