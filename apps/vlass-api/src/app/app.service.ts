import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateUserDto, UpdateUserDto, CreatePostDto, UpdatePostDto } from './dto';
import { User, Post } from './entities';
import { UserRepository, PostRepository } from './repositories';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly userRepository: UserRepository,
    private readonly postRepository: PostRepository,
  ) {}

  getData(): { message: string } {
    return { message: 'VLASS Portal API' };
  }

  async getHealthStatus() {
    try {
      const isConnected = this.dataSource.isInitialized;
      const dbStatus = isConnected
        ? 'connected'
        : 'disconnected';

      this.logger.log(`Database status: ${dbStatus}`);

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        environment: process.env.NODE_ENV || 'development',
      };
    } catch (error) {
      this.logger.error('Health check failed', error instanceof Error ? error.message : error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // User endpoints
  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async getUserByUsername(username: string): Promise<User> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new NotFoundException(`User with username ${username} not found`);
    }
    return user;
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findByUsername(createUserDto.username);
    if (existingUser) {
      throw new BadRequestException(`Username ${createUserDto.username} already exists`);
    }
    return this.userRepository.create(createUserDto);
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    const updatedUser = await this.userRepository.update(id, updateUserDto);
    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.userRepository.softDelete(id);
  }

  // Post endpoints
  async getAllPosts(): Promise<Post[]> {
    return this.postRepository.findAll();
  }

  async getPublishedPosts(): Promise<Post[]> {
    return this.postRepository.findPublished();
  }

  async getPostById(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return post;
  }

  async getPostsByUser(userId: string): Promise<Post[]> {
    // Verify user exists
    await this.getUserById(userId);
    return this.postRepository.findByUser(userId);
  }

  async createPost(createPostDto: CreatePostDto): Promise<Post> {
    // Verify user exists
    await this.getUserById(createPostDto.user_id);
    return this.postRepository.create(createPostDto);
  }

  async updatePost(id: string, updatePostDto: UpdatePostDto): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    const updatedPost = await this.postRepository.update(id, updatePostDto);
    if (!updatedPost) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return updatedPost;
  }

  async publishPost(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    const publishedPost = await this.postRepository.publish(id);
    if (!publishedPost) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return publishedPost;
  }

  async unpublishPost(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    const unpublishedPost = await this.postRepository.unpublish(id);
    if (!unpublishedPost) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return unpublishedPost;
  }

  async deletePost(id: string): Promise<boolean> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return this.postRepository.softDelete(id);
  }
}
