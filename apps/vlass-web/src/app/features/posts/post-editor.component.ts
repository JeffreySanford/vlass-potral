import { Component, DestroyRef, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PostsApiService } from './posts-api.service';

interface ParsedViewerBlock {
  raw: string;
  encodedState: string;
}

@Component({
  selector: 'app-post-editor',
  templateUrl: './post-editor.component.html',
  styleUrl: './post-editor.component.scss',
  standalone: false, // eslint-disable-line @angular-eslint/prefer-standalone
})
export class PostEditorComponent {
  readonly editorForm = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(20)]],
  });
  saving = false;
  statusMessage = '';
  viewerBlocks: ParsedViewerBlock[] = [];

  private readonly postsApi = inject(PostsApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  saveDraft(): void {
    if (this.editorForm.invalid) {
      this.statusMessage = 'Please enter a valid title and content.';
      return;
    }

    this.saving = true;
    const payload = {
      title: String(this.editorForm.value.title),
      content: String(this.editorForm.value.content),
    };
    this.postsApi
      .createPost(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (post) => {
          this.saving = false;
          this.statusMessage = 'Draft saved.';
          this.router.navigate(['/posts', post.id]);
        },
        error: (error: HttpErrorResponse) => {
          this.saving = false;
          this.statusMessage =
            typeof error.error?.message === 'string' ? error.error.message : 'Failed to save draft.';
        },
      });
  }

  parseViewerBlocks(): void {
    const content = String(this.editorForm.value.content || '');
    const blocks: ParsedViewerBlock[] = [];
    const regex = /```viewer\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    match = regex.exec(content);
    while (match) {
      const rawJson = match[1].trim();
      try {
        const parsed = JSON.parse(rawJson) as { ra?: unknown; dec?: unknown; fov?: unknown; survey?: unknown };
        const encodedState = this.encodeState({
          ra: Number(parsed.ra),
          dec: Number(parsed.dec),
          fov: Number(parsed.fov),
          survey: String(parsed.survey || 'VLASS'),
        });
        blocks.push({ raw: rawJson, encodedState });
      } catch {
        // Skip invalid viewer blocks in preview.
      }
      match = regex.exec(content);
    }

    this.viewerBlocks = blocks;
    this.statusMessage =
      blocks.length > 0
        ? `Parsed ${blocks.length} viewer block${blocks.length === 1 ? '' : 's'}.`
        : 'No valid viewer blocks found.';
  }

  private encodeState(state: { ra: number; dec: number; fov: number; survey: string }): string {
    return btoa(JSON.stringify(state))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
}
