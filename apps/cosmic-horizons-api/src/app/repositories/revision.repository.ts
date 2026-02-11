import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Revision } from '../entities/revision.entity';

@Injectable()
export class RevisionRepository {
  constructor(
    @InjectRepository(Revision)
    private readonly repo: Repository<Revision>,
  ) {}

  async create(revision: Partial<Revision>): Promise<Revision> {
    const entity = this.repo.create(revision);
    return this.repo.save(entity);
  }

  async findByPost(postId: string): Promise<Revision[]> {
    return this.repo.find({
      where: {
        post_id: postId,
      },
      order: { created_at: 'ASC' },
      relations: ['user', 'post'],
    });
  }

  async findLatestByPost(postId: string): Promise<Revision | null> {
    return this.repo.findOne({
      where: {
        post_id: postId,
      },
      order: { created_at: 'DESC' },
      relations: ['user', 'post'],
    });
  }

  async findById(id: string): Promise<Revision | null> {
    return this.repo.findOne({
      where: {
        id,
      },
      relations: ['user', 'post'],
    });
  }

  async hardDelete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
