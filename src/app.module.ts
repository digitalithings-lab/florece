import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { CareModule } from "./care/care.module";
import { PsyModule } from "./psy/psy.module";
import { ChallengesModule } from "./challenges/challenges.module";
import { ChatModule } from "./chat/chat.module";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles";
import { config } from "./config";
import { GardenModule } from "./garden/garden.module";
import { GroqModule } from "./groq/groq.module";
import { HealthController } from "./health/health.controller";
import { JournalModule } from "./journal/journal.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProfileModule } from "./profile/profile.module";
import { SafetyModule } from "./safety/safety.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    JwtModule.register({
      global: true,
      secret: config.jwtSecret,
      signOptions: { expiresIn: config.accessTokenTtlSeconds },
    }),
    PrismaModule,
    GroqModule,
    SafetyModule,
    AuthModule,
    ProfileModule,
    ChallengesModule,
    JournalModule,
    ChatModule,
    GardenModule,
    CareModule,
    PsyModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
