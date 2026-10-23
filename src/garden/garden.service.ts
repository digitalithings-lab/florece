import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Item, ItemCategory, Plan, Prisma, SeedReason } from "@prisma/client";
import { growthStage, MAX_GROWTH, UNLOCKS } from "../activities/activities.constants";
import { effectivePlan } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { GARDEN_COLS, GARDEN_ROWS } from "./garden.constants";

@Injectable()
export class GardenService {
  constructor(private readonly prisma: PrismaService) {}

  async garden(userId: string) {
    const [profile, owned] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId }, include: { user: { include: { avatar: true } } } }),
      this.prisma.userItem.findMany({
        where: { userId },
        include: { item: true, placement: true },
        orderBy: { acquiredAt: "asc" },
      }),
    ]);

    const accessory = owned.find((o) => o.equipped && o.item.category === ItemCategory.ACCESSORY);

    return {
      seedsBalance: profile.seedsBalance,
      waterBalance: profile.waterBalance,
      grid: { cols: GARDEN_COLS, rows: GARDEN_ROWS },
      avatar: profile.user.avatar && {
        species: profile.user.avatar.species,
        name: profile.user.avatar.name,
        accessory: accessory ? { userItemId: accessory.id, emoji: accessory.item.emoji, name: accessory.item.name } : null,
      },
      items: owned.map((owner) => ({
        userItemId: owner.id,
        item: this.formatItem(owner.item),
        placement: owner.placement && { x: owner.placement.x, y: owner.placement.y },
        // Solo las plantas crecen; lo demás llega completo.
        growth: owner.growth,
        stage: owner.item.category === ItemCategory.PLANT ? growthStage(owner.growth) : "grown",
        equipped: owner.equipped,
      })),
    };
  }

  // Regar una planta: gasta una gota y la hace crecer un poco.
  async water(userId: string, userItemId: string) {
    const owned = await this.prisma.userItem.findFirst({ where: { id: userItemId, userId }, include: { item: true } });
    if (!owned) throw new NotFoundException("Ese objeto no está en tu inventario");
    if (owned.item.category !== ItemCategory.PLANT) throw new BadRequestException("Solo las plantas se riegan");
    if (owned.growth >= MAX_GROWTH) throw new ConflictException("Esta planta ya creció por completo");

    await this.prisma.$transaction(async (tx) => {
      const spent = await tx.profile.updateMany({
        where: { userId, waterBalance: { gte: 1 } },
        data: { waterBalance: { decrement: 1 } },
      });
      if (spent.count === 0) throw new BadRequestException("No tienes agua. Haz una actividad para conseguir gotas 💧");
      await tx.userItem.update({ where: { id: owned.id }, data: { growth: { increment: 1 } } });
    });
    return this.garden(userId);
  }

  // Ponerle (o quitarle, con null) un accesorio al compañero. Solo uno a la vez.
  async equip(userId: string, userItemId: string | null) {
    if (userItemId) {
      const owned = await this.prisma.userItem.findFirst({ where: { id: userItemId, userId }, include: { item: true } });
      if (!owned) throw new NotFoundException("Ese objeto no está en tu inventario");
      if (owned.item.category !== ItemCategory.ACCESSORY) throw new BadRequestException("Eso no es un accesorio");
    }
    await this.prisma.$transaction([
      this.prisma.userItem.updateMany({ where: { userId, equipped: true }, data: { equipped: false } }),
      ...(userItemId ? [this.prisma.userItem.update({ where: { id: userItemId }, data: { equipped: true } })] : []),
    ]);
    return this.garden(userId);
  }

  async shop(userId: string) {
    const [profile, items, owned] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId } }),
      this.prisma.item.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { priceSeeds: "asc" }] }),
      this.prisma.userItem.findMany({ where: { userId }, select: { itemId: true } }),
    ]);
    const ownedIds = new Set(owned.map((o) => o.itemId));
    const isPremium = effectivePlan(profile) === Plan.PREMIUM;

    return {
      seedsBalance: profile.seedsBalance,
      items: items.map((item) => ({
        ...this.formatItem(item),
        owned: ownedIds.has(item.id),
        locked: item.premiumOnly && !isPremium,
        affordable: profile.seedsBalance >= item.priceSeeds,
        // Los exclusivos se muestran para motivar, pero no se compran.
        exclusive: !item.purchasable,
        unlockHint: item.unlockKey ? (UNLOCKS.find((u) => u.key === item.unlockKey)?.description ?? null) : null,
      })),
    };
  }

  async buy(userId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, active: true } });
    if (!item) throw new NotFoundException("Ese objeto no existe");
    if (!item.purchasable) throw new ForbiddenException("Este objeto no se compra: se gana con constancia");

    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    if (item.premiumOnly && effectivePlan(profile) !== Plan.PREMIUM) {
      throw new ForbiddenException("Este objeto es exclusivo del plan premium");
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Descuento atómico: solo si el saldo alcanza en este mismo instante.
        const charged = await tx.profile.updateMany({
          where: { userId, seedsBalance: { gte: item.priceSeeds } },
          data: { seedsBalance: { decrement: item.priceSeeds } },
        });
        if (charged.count === 0) {
          throw new BadRequestException("Aún no tienes suficientes semillas para este objeto");
        }
        const userItem = await tx.userItem.create({ data: { userId, itemId } });
        await tx.seedTransaction.create({
          data: { userId, amount: -item.priceSeeds, reason: SeedReason.PURCHASE, referenceId: userItem.id },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ya tienes este objeto en tu jardín");
      }
      throw err;
    }

    return this.garden(userId);
  }

  async place(userId: string, userItemId: string, x: number, y: number) {
    const owned = await this.findOwned(userId, userItemId);
    const item = await this.prisma.item.findUniqueOrThrow({ where: { id: owned.itemId } });
    if (item.category === ItemCategory.ACCESSORY) {
      throw new BadRequestException("Los accesorios se le ponen a tu compañero, no se plantan");
    }

    const occupied = await this.prisma.gardenPlacement.findFirst({
      where: { x, y, userItem: { userId }, NOT: { userItemId } },
    });
    if (occupied) {
      throw new ConflictException("Ese lugar ya está ocupado");
    }

    await this.prisma.gardenPlacement.upsert({
      where: { userItemId },
      create: { userItemId, x, y },
      update: { x, y },
    });
    return this.garden(userId);
  }

  async remove(userId: string, userItemId: string) {
    await this.findOwned(userId, userItemId);
    await this.prisma.gardenPlacement.deleteMany({ where: { userItemId } });
    return this.garden(userId);
  }

  private async findOwned(userId: string, userItemId: string) {
    const owned = await this.prisma.userItem.findFirst({ where: { id: userItemId, userId } });
    if (!owned) throw new NotFoundException("Ese objeto no está en tu inventario");
    return owned;
  }

  private formatItem(item: Item) {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      category: item.category,
      emoji: item.emoji,
      imageUrl: item.imageUrl,
      priceSeeds: item.priceSeeds,
      premiumOnly: item.premiumOnly,
    };
  }
}
