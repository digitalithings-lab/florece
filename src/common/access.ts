import { ConsentType, Plan, Profile } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export function effectivePlan(profile: Pick<Profile, "plan" | "premiumUntil">): Plan {
  if (profile.plan === Plan.PREMIUM && (!profile.premiumUntil || profile.premiumUntil > new Date())) {
    return Plan.PREMIUM;
  }
  return Plan.FREE;
}

export async function hasActiveConsent(prisma: PrismaService, userId: string, type: ConsentType): Promise<boolean> {
  const consent = await prisma.consent.findFirst({
    where: { userId, type, revokedAt: null },
    select: { id: true },
  });
  return consent !== null;
}
