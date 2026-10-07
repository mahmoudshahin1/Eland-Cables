import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { InquiriesModule } from './inquiries/inquiries.module.js';
import { AdminIdentityModule } from './admin-identity/admin-identity.module.js';
import { AdminCustomersModule } from './admin-customers/admin-customers.module.js';
import { validateEnv } from './common/config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.LOGIN_RATE_WINDOW_MS || 60000),
        limit: Number(process.env.LOGIN_RATE_MAX || 20),
      },
    ]),
    PrismaModule,
    AuthModule,
    MasterDataModule,
    InquiriesModule,
    AdminIdentityModule,
    AdminCustomersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
