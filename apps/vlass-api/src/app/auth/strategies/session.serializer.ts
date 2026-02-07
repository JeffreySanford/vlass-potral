import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { UserRepository } from '../../repositories';
import { User } from '../../entities';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private userRepository: UserRepository) {
    super();
  }

  serializeUser(user: User, done: (err: Error | null, id?: string) => void) {
    done(null, user.id.toString());
  }

  async deserializeUser(
    id: string,
    done: (err: Error | null, user?: User | null) => void,
  ) {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
      });
      done(null, user);
    } catch (error) {
      done(error as Error);
    }
  }
}
