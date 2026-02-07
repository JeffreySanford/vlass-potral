import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Response,
  BadRequestException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../entities';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

type RequestWithUser = ExpressRequest & { user?: User };

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.loginWithCredentials(loginDto);
    const access_token = this.authService.signToken(user);

    return {
      access_token,
      token_type: 'Bearer',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        created_at: user.created_at,
      },
    };
  }

  /**
   * Initiates GitHub OAuth flow
   * Redirects to GitHub login
   */
  @Get('login')
  @UseGuards(AuthGuard('github'))
  gitHubLogin() {
    // Passport redirects to GitHub
  }

  /**
   * GitHub OAuth callback endpoint
   * Called by GitHub after user approves access
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async gitHubCallback(@Request() req: RequestWithUser, @Response() res: ExpressResponse) {
    if (!req.user) {
      throw new BadRequestException('Authentication failed');
    }

    // At this point, user is authenticated and session is created
    // Redirect to frontend with success
    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/dashboard`);
  }

  /**
   * Get current authenticated user
   */
  @Get('me')
  getCurrentUser(@Request() req: RequestWithUser) {
    if (!req.user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        display_name: req.user.display_name,
        github_id: req.user.github_id,
        created_at: req.user.created_at,
      },
    };
  }

  /**
   * Logout endpoint
   */
  @Post('logout')
  logout(@Request() req: ExpressRequest, @Response() res: ExpressResponse) {
    req.logout((err: Error | null) => {
      if (err) {
        throw err;
      }
      res.json({ message: 'Logged out successfully' });
    });
  }
}
