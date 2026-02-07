import { Injectable, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import Strategy from 'passport-github';
import { UserRepository } from '../repositories';
import { CreateUserDto } from '../dto';
import { User } from '../entities';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;
  email: string | null;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validate or create a user from GitHub OAuth profile
   */
  async validateOrCreateUser(profile: Strategy.Profile): Promise<User> {
    const {
      id: github_id,
      login: username,
      emails,
      displayName,
    } = profile;

    const display_name = displayName || username;
    const avatar_url = profile.photos?.[0]?.value || null;

    // Get primary email from GitHub
    const email = emails && emails.length > 0 ? emails[0].value : null;

    if (!email) {
      throw new BadRequestException(
        'GitHub account must have a public email. Please set one at github.com/settings/emails',
      );
    }

    // Find existing user by GitHub ID
    let user = await this.userRepository.findByGitHubId(github_id);

    if (!user) {
      // Create new user
      const createUserDto: CreateUserDto = {
        username,
        email,
        github_id,
        display_name,
        avatar_url,
      };

      user = await this.userRepository.create(createUserDto);
    } else {
      // Update user with latest profile info
      user.username = username;
      user.email = email;
      user.display_name = display_name;
      user.avatar_url = avatar_url;
      user.updated_at = new Date();
      await this.userRepository.save(user);
    }

    return user;
  }

  /**
   * Get current user from session
   */
  async getCurrentUser(userId: string): Promise<User | null> {
    if (!userId) return null;
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async loginWithCredentials(credentials: LoginDto): Promise<User> {
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    const user = await this.userRepository.findByEmailAndPassword(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async registerWithCredentials(dto: RegisterDto): Promise<User> {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    const password = dto.password;
    const display_name = dto.display_name?.trim() || username;

    if (username.length < 3) {
      throw new BadRequestException('Username must be at least 3 characters.');
    }

    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const byUsername = await this.userRepository.findByUsername(username);
    if (byUsername) {
      throw new ConflictException('Username is already in use.');
    }

    const byEmail = await this.userRepository.findByEmail(email);
    if (byEmail) {
      throw new ConflictException('Email is already in use.');
    }

    return this.userRepository.createWithPassword({
      username,
      display_name,
      email,
      password,
    });
  }

  signToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };

    return this.jwtService.sign(payload);
  }
}
