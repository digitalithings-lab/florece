import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConsentType, Prisma, User, UserRole } from "@prisma/client";
import { hashPassword, randomToken, sha256, verifyPassword } from "../common/crypto";
import { ageOn, dateFromString, isValidTimezone } from "../common/dates";
import { generateLinkCode } from "../common/link-code";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, RegisterDto, RegisterPsychologistDto } from "./dto/auth.dto";

const REQUIRED_CONSENTS: ConsentType[] = [ConsentType.TERMS, ConsentType.PRIVACY, ConsentType.SENSITIVE_DATA];
const MINIMUM_AGE = 18;
const DEFAULT_TIMEZONE = "America/Mexico_City";

// Hash de una contraseña que nunca coincide; se usa para que un correo inexistente
// tarde lo mismo en responder que uno existente.
const DUMMY_HASH_PROMISE = hashPassword(randomToken());

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto, deviceName?: string) {
    const missing = REQUIRED_CONSENTS.filter((type) => !dto.consents.includes(type));
    if (missing.length > 0) {
      throw new BadRequestException(`Faltan consentimientos obligatorios: ${missing.join(", ")}`);
    }

    const birthDate = dateFromString(dto.birthDate);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new BadRequestException("La fecha de nacimiento no es válida");
    }
    if (ageOn(birthDate) < MINIMUM_AGE) {
      throw new BadRequestException(`Florece es solo para personas de ${MINIMUM_AGE} años o más`);
    }

    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    if (!isValidTimezone(timezone)) {
      throw new BadRequestException("La zona horaria no es válida");
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          birthDate,
          profile: {
            create: {
              displayName: dto.displayName.trim(),
              timezone,
              countryCode: dto.countryCode,
            },
          },
          consents: {
            create: dto.consents.map((type) => ({ type, version: config.consentVersion })),
          },
        },
      });
      return this.issueTokens(user, deviceName);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese correo");
      }
      throw err;
    }
  }

  // Registro desde el panel web. El psicólogo puede trabajar de inmediato;
  // un administrador puede suspenderlo después si hace falta.
  async registerPsychologist(dto: RegisterPsychologistDto, deviceName?: string) {
    const missing = [ConsentType.TERMS, ConsentType.PRIVACY].filter((type) => !dto.consents.includes(type));
    if (missing.length > 0) {
      throw new BadRequestException(`Faltan consentimientos obligatorios: ${missing.join(", ")}`);
    }
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    if (!isValidTimezone(timezone)) {
      throw new BadRequestException("La zona horaria no es válida");
    }

    // Se revisa antes de crear: el error de clave duplicada no siempre dice qué campo chocó.
    if (await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } })) {
      throw new ConflictException("Ya existe una cuenta con ese correo. Entra con tu contraseña.");
    }

    const passwordHash = await hashPassword(dto.password);

    // Reintenta si el código aleatorio ya existe (muy improbable).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const user = await this.prisma.user.create({
          data: {
            email: dto.email,
            passwordHash,
            role: UserRole.PSYCHOLOGIST,
            profile: { create: { displayName: dto.fullName.trim(), timezone } },
            consents: { create: dto.consents.map((type) => ({ type, version: config.consentVersion })) },
            psychologist: {
              create: {
                fullName: dto.fullName.trim(),
                licenseNumber: dto.licenseNumber.trim(),
                specialties: dto.specialties?.map((s) => s.trim()).filter(Boolean) ?? [],
                sessionPriceCents: 0,
                timezone,
                linkCode: generateLinkCode(),
              },
            },
          },
        });
        return this.issueTokens(user, deviceName);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          const target = String(err.meta?.target ?? "");
          if (!target.includes("link")) throw new ConflictException("Ya existe una cuenta con ese correo. Entra con tu contraseña.");
          continue; // choque de código: se genera otro
        }
        throw err;
      }
    }
    throw new ConflictException("No pudimos crear la cuenta. Inténtalo de nuevo.");
  }

  async login(dto: LoginDto, deviceName?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const valid = user?.passwordHash
      ? await verifyPassword(dto.password, user.passwordHash)
      : await verifyPassword(dto.password, await DUMMY_HASH_PROMISE).then(() => false);

    if (!user || !valid || user.deletedAt) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    return this.issueTokens(user, deviceName);
  }

  // Rota el refresh token: el usado se revoca y se entrega uno nuevo.
  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.deletedAt) {
      throw new UnauthorizedException("La sesión expiró, vuelve a iniciar sesión");
    }

    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      // Otro proceso ya usó este token al mismo tiempo.
      throw new UnauthorizedException("La sesión expiró, vuelve a iniciar sesión");
    }

    return this.issueTokens(session.user, session.deviceName ?? undefined);
  }

  async logout(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, avatar: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException("La cuenta no existe");
    }
    return this.publicUser(user);
  }

  private async issueTokens(user: User, deviceName?: string) {
    // Los correos de ADMIN_EMAILS obtienen el rol de administración al iniciar sesión.
    if (config.adminEmails.includes(user.email) && user.role !== UserRole.ADMIN) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
    }

    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        deviceName: deviceName?.slice(0, 100),
        expiresAt,
      },
    });

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });

    return {
      accessToken,
      accessTokenExpiresIn: config.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: await this.me(user.id),
    };
  }

  private publicUser(user: Prisma.UserGetPayload<{ include: { profile: true; avatar: true } }>) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt,
      profile: user.profile && {
        displayName: user.profile.displayName,
        onboardingCompleted: user.profile.onboardingCompletedAt !== null,
      },
      hasAvatar: user.avatar !== null,
    };
  }
}
