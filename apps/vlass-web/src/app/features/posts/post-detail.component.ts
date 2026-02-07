import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PostsApiService, PostModel } from './posts-api.service';

@Component({
  selector: 'app-post-detail',
  templateUrl: './post-detail.component.html',
  styleUrl: './post-detail.component.scss',
  standalone: false, // eslint-disable-line @angular-eslint/prefer-standalone
})
export class PostDetailComponent implements OnInit {
  post: PostModel | null = null;
  loading = false;
  publishing = false;
  statusMessage = '';

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly postsApi = inject(PostsApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/posts']);
      return;
    }

    this.loading = true;
    this.postsApi
      .getPostById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (post) => {
          this.post = post;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.statusMessage = typeof error.error?.message === 'string' ? error.error.message : 'Post was not found.';
        },
      });
  }

  publish(): void {
    if (!this.post || this.post.status === 'published' || this.publishing) {
      return;
    }

    this.publishing = true;
    this.postsApi
      .publishPost(this.post.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (post) => {
          this.post = post;
          this.publishing = false;
          this.statusMessage = 'Post published.';
        },
        error: (error: HttpErrorResponse) => {
          this.publishing = false;
          this.statusMessage =
            typeof error.error?.message === 'string' ? error.error.message : 'Failed to publish post.';
        },
      });
  }
}
