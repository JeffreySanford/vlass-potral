import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, JwtPayload } from '../auth.service';
import { User } from '../../entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env['JWT_SECRET'] || 'dev-jwt-secret-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.authService.getCurrentUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return user;
  }
}
