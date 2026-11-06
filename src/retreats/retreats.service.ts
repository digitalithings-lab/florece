import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RetreatsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.retreat.findMany({
      orderBy: { startDate: "asc" },
    });
  }

  async findByYear(year: number) {
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
    return this.prisma.retreat.findMany({
      where: {
        startDate: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
      orderBy: { startDate: "asc" },
    });
  }
}
