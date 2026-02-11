import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './database.config';
import {
  User,
  Post,
  Revision,
  Comment,
  Snapshot,
  ViewerState,
  ViewerSnapshot,
  AuditLog,
  CosmicTileCache,
} from './entities';
import { UserRepository, PostRepository, AuditLogRepository, RevisionRepository } from './repositories';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig()),
    TypeOrmModule.forFeature([
      User,
      Post,
      Revision,
      Comment,
      Snapshot,
      ViewerState,
      ViewerSnapshot,
      AuditLog,
      CosmicTileCache,
    ]),
  ],
  providers: [UserRepository, PostRepository, AuditLogRepository, RevisionRepository],
  exports: [TypeOrmModule, UserRepository, PostRepository, AuditLogRepository, RevisionRepository],
})
export class DatabaseModule {}
