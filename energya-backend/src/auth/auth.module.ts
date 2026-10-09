import { Module } from '@nestjs/common';
import { AuthRepository } from './auth.repository.js';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32 || secret === 'energya_connect_dotnet9_super_secret_jwt_key_2026_x89f!') {
          throw new Error('JWT_SECRET must be configured to a non-default value in production.');
        }
        return {
          secret,
          signOptions: { 
            expiresIn: '1h',
            issuer: 'Energya.DotNet9.JwtAuthority',
            audience: 'Energya.Connect.Api'
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, PrismaService, AuthRepository],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
