import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github';
import { AuthService } from '../auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env['GITHUB_CLIENT_ID'],
      clientSecret: process.env['GITHUB_CLIENT_SECRET'],
      callbackURL: process.env['GITHUB_CALLBACK_URL'] || 'http://localhost:3000/api/auth/github/callback',
      scope: ['user:email'],
    } as any);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    const user = await this.authService.validateOrCreateUser(profile);
    return user;
  }
}
