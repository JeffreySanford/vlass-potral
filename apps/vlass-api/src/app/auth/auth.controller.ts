import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Response,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/auth')
export class AuthController {
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
  async gitHubCallback(@Request() req: any, @Response() res: any) {
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
  getCurrentUser(@Request() req: any) {
    if (!req.user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        full_name: req.user.full_name,
        github_id: req.user.github_id,
        created_at: req.user.created_at,
      },
    };
  }

  /**
   * Logout endpoint
   */
  @Post('logout')
  logout(@Request() req: any, @Response() res: any) {
    req.logout((err: any) => {
      if (err) {
        throw err;
      }
      res.json({ message: 'Logged out successfully' });
    });
  }
}
