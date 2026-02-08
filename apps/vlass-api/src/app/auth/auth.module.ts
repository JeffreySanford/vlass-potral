import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GitHubStrategy } from './strategies/github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SessionSerializer } from './strategies/session.serializer';
import { DatabaseModule } from '../database.module';
import { getJwtSecret } from '../config/security.config';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: {
        expiresIn: process.env['JWT_EXPIRES_IN'] || '15m',
      },
    }),
    DatabaseModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GitHubStrategy,
    JwtStrategy,
    SessionSerializer,
  ],
  exports: [AuthService, PassportModule, JwtModule],
})
export class AuthModule {}
