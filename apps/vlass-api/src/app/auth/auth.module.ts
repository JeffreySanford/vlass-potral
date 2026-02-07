import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GitHubStrategy } from './strategies/github.strategy';
import { SessionSerializer } from './strategies/session.serializer';
import { UserRepository } from '../repositories';

@Module({
  imports: [
    PassportModule.register({ session: true }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GitHubStrategy,
    SessionSerializer,
    UserRepository,
  ],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
