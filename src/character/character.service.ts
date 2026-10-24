import { ForbiddenException, Injectable } from "@nestjs/common";
import { ItemCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CharacterLook, DEFAULT_LOOK, PAID_GARMENTS } from "./character.constants";
import { CharacterLookDto } from "./dto/character.dto";

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const [character, owned, pet] = await Promise.all([
      this.prisma.character.findUnique({ where: { userId } }),
      this.prisma.userItem.findMany({
        where: { userId, item: { category: { in: [ItemCategory.CLOTHING, ItemCategory.ACCESSORY] } } },
        include: { item: true },
        orderBy: { acquiredAt: "asc" },
      }),
      this.prisma.avatar.findUnique({ where: { userId } }),
    ]);
    const ownedSlugs = new Set(owned.map((o) => o.item.slug));

    return {
      // Quien aún no personalizó su avatar empieza con uno básico.
      look: { ...DEFAULT_LOOK, ...((character?.look as Partial<CharacterLook> | undefined) ?? {}) },
      customized: character !== null,
      unlockedGarments: Object.entries(PAID_GARMENTS)
        .filter(([, slug]) => ownedSlugs.has(slug))
        .map(([garment]) => garment),
      paidGarments: PAID_GARMENTS,
      accessories: owned
        .filter((o) => o.item.category === ItemCategory.ACCESSORY)
        .map((o) => ({ userItemId: o.id, slug: o.item.slug, name: o.item.name, emoji: o.item.emoji, equipped: o.equipped })),
      pet: pet && { species: pet.species, name: pet.name },
    };
  }

  async save(userId: string, look: CharacterLookDto) {
    // Las prendas de pago solo se pueden usar si ya se compraron.
    const needed = [`top:${look.top}`, `shoes:${look.shoes}`]
      .map((garment) => PAID_GARMENTS[garment])
      .filter((slug): slug is string => Boolean(slug));
    if (needed.length > 0) {
      const owned = await this.prisma.userItem.count({ where: { userId, item: { slug: { in: needed } } } });
      if (owned < needed.length) throw new ForbiddenException("Esa prenda aún no es tuya. Puedes comprarla en la tienda.");
    }

    const data = { ...look } as unknown as Prisma.InputJsonObject;
    await this.prisma.character.upsert({ where: { userId }, create: { userId, look: data }, update: { look: data } });
    return this.get(userId);
  }
}
