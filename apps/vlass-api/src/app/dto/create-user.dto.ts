export class CreateUserDto {
  username!: string;
  email!: string;
  github_id?: number;
  display_name?: string;
  avatar_url?: string | null;
}
