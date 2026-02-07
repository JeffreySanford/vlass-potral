import { Injectable, BadRequestException } from '@nestjs/common';
import { UserRepository } from '../repositories';
import { CreateUserDto } from '../dto';

@Injectable()
export class AuthService {
  constructor(private userRepository: UserRepository) {}

  /**
   * Validate or create a user from GitHub OAuth profile
   */
  async validateOrCreateUser(profile: any) {
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
  async getCurrentUser(userId: number) {
    if (!userId) return null;
    return this.userRepository.findOne({ where: { id: userId } });
  }
}
