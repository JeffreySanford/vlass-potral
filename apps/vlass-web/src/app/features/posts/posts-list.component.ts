import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { PostsApiService, PostModel } from './posts-api.service';

@Component({
  selector: 'app-posts-list',
  templateUrl: './posts-list.component.html',
  styleUrl: './posts-list.component.scss',
  standalone: false, // eslint-disable-line @angular-eslint/prefer-standalone
})
export class PostsListComponent implements OnInit {
  posts: PostModel[] = [];
  loading = false;
  errorMessage = '';

  private readonly postsApi = inject(PostsApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.loading = true;
    this.postsApi
      .getPublishedPosts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (posts) => {
          this.posts = posts;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage =
            typeof error.error?.message === 'string' ? error.error.message : 'Failed to load published posts.';
          this.loading = false;
        },
      });
  }

  openPost(post: PostModel): void {
    this.router.navigate(['/posts', post.id]);
  }

  createDraft(): void {
    this.router.navigate(['/posts/new']);
  }
}
