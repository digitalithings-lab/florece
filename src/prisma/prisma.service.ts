import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { decryptDeep, encryptData, encryptWhere } from "../common/field-crypto";

// Cliente de base de datos con cifrado transparente de los datos personales de las citas:
// al escribir se cifran, al leer se descifran. Prisma conecta solo en la primera consulta.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super();
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, args, query }) {
            if (model === "Appointment" && args && typeof args === "object") {
              const a: any = args;
              if (a.data !== undefined) a.data = encryptData(a.data);
              if (a.create !== undefined) a.create = encryptData(a.create);
              if (a.update !== undefined) a.update = encryptData(a.update);
              if (a.where !== undefined) a.where = encryptWhere(a.where);
            }
            return decryptDeep(await query(args));
          },
        },
      },
    }) as unknown as this;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
