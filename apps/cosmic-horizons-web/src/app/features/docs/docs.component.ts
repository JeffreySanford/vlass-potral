import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';

type DocEntry = {
  id: string;
  label: string;
  sourcePath: string;
};

type DocViewModel = {
  state: 'loading' | 'ready' | 'error';
  title: string;
  sourcePath: string;
  html: string;
  errorMessage: string;
};

type DocResponse = {
  docId: string;
  sourcePath: string;
  content: string;
};

@Component({
  selector: 'app-docs',
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.scss'],
  standalone: false,
})
export class DocsComponent {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private readonly apiBaseUrl = 'http://localhost:3000';

  readonly docCatalog: Record<string, DocEntry> = {
    architecture: {
      id: 'architecture',
      label: 'System Architecture',
      sourcePath: 'documentation/architecture/ARCHITECTURE.md',
    },
    roadmap: {
      id: 'roadmap',
      label: 'Roadmap',
      sourcePath: 'documentation/planning/roadmap/ROADMAP.md',
    },
    'overview-v2': {
      id: 'overview-v2',
      label: 'Overview V2',
      sourcePath: 'documentation/index/OVERVIEW-V2.md',
    },
    'overview-critique': {
      id: 'overview-critique',
      label: 'Overview V2 Critique',
      sourcePath: 'documentation/index/OVERVIEW-V2-CRITIQUE.md',
    },
    'product-charter': {
      id: 'product-charter',
      label: 'Product Charter',
      sourcePath: 'documentation/product/PRODUCT-CHARTER.md',
    },
    'source-of-truth': {
      id: 'source-of-truth',
      label: 'Source of Truth',
      sourcePath: 'documentation/governance/SOURCE-OF-TRUTH.md',
    },
    'quick-start': {
      id: 'quick-start',
      label: 'Quick Start',
      sourcePath: 'documentation/operations/QUICK-START.md',
    },
    'env-reference': {
      id: 'env-reference',
      label: 'Environment Reference',
      sourcePath: 'documentation/reference/ENV-REFERENCE.md',
    },
    'messaging-architecture': {
      id: 'messaging-architecture',
      label: 'Messaging Architecture',
      sourcePath: 'documentation/backend/messaging/MESSAGING-ARCHITECTURE.md',
    },
    'cosmic-datasets': {
      id: 'cosmic-datasets',
      label: 'Cosmic Datasets',
      sourcePath: 'documentation/reference/COSMIC-DATASETS.md',
    },
    'testing-strategy': {
      id: 'testing-strategy',
      label: 'Testing Strategy',
      sourcePath: 'documentation/quality/TESTING-STRATEGY.md',
    },
    'coding-standards': {
      id: 'coding-standards',
      label: 'Coding Standards',
      sourcePath: 'documentation/quality/CODING-STANDARDS.md',
    },
    'audit-strategy': {
      id: 'audit-strategy',
      label: 'Audit Strategy (ADR-style)',
      sourcePath: 'documentation/architecture/AUDIT-STRATEGY-SITEWIDE.md',
    },
  };

  readonly docId$ = this.route.params.pipe(
    map((params) => (params['docId'] as string | undefined) ?? null),
    distinctUntilChanged(),
  );

  readonly docViewModel$ = this.docId$.pipe(
    switchMap((docId) => {
      if (!docId) {
        return of(null);
      }
      const entry = this.docCatalog[docId];
      if (!entry) {
        return of({
          state: 'error',
          title: 'Unknown document',
          sourcePath: docId,
          html: '',
          errorMessage: `Unknown documentation key: ${docId}`,
        } as DocViewModel);
      }
      return this.http
        .get<DocResponse>(
          `${this.apiBaseUrl}/api/internal-docs/content/${entry.id}`,
        )
        .pipe(
          map(
            (response) =>
              ({
                state: 'ready',
                title: entry.label,
                sourcePath: response.sourcePath,
                html: this.renderMarkdown(response.content),
                errorMessage: '',
              }) as DocViewModel,
          ),
          catchError((error: { status?: number }) =>
            of({
              state: 'error',
              title: entry.label,
              sourcePath: entry.sourcePath,
              html: '',
              errorMessage:
                error.status === 404
                  ? 'The mapped markdown file was not found in this workspace.'
                  : 'Unable to load this document from the API.',
            } as DocViewModel),
          ),
          startWith({
            state: 'loading',
            title: entry.label,
            sourcePath: entry.sourcePath,
            html: '',
            errorMessage: '',
          } as DocViewModel),
        );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly sections = [
    {
      title: 'Project Overview',
      icon: 'info',
      links: [
        { label: 'System Architecture', path: '/docs/architecture' },
        { label: 'Product Roadmap', path: '/docs/roadmap' },
        { label: 'Overview V2', path: '/docs/overview-v2' },
        { label: 'Overview V2 Critique', path: '/docs/overview-critique' },
      ],
    },
    {
      title: 'Frontend & UI',
      icon: 'web',
      links: [
        { label: 'Product Charter', path: '/docs/product-charter' },
        { label: 'Quick Start', path: '/docs/quick-start' },
        { label: 'Environment Reference', path: '/docs/env-reference' },
      ],
    },
    {
      title: 'Science & Data',
      icon: 'science',
      links: [
        {
          label: 'Messaging Architecture',
          path: '/docs/messaging-architecture',
        },
        { label: 'Cosmic Datasets', path: '/docs/cosmic-datasets' },
        { label: 'Source of Truth', path: '/docs/source-of-truth' },
      ],
    },
    {
      title: 'Quality & ADRs',
      icon: 'verified',
      links: [
        { label: 'Testing Strategy', path: '/docs/testing-strategy' },
        { label: 'Coding Standards', path: '/docs/coding-standards' },
        {
          label: 'Audit Strategy (ADR-style)',
          path: '/docs/audit-strategy',
        },
      ],
    },
  ];

  private renderMarkdown(markdown: string): string {
    const codeBlocks: string[] = [];
    let content = this.escapeHtml(markdown).replace(
      /```([\w-]+)?\n([\s\S]*?)```/g,
      (_match, language = '', code) => {
        const safeLanguage = this.escapeHtml(language);
        const block = `<pre><code class="lang-${safeLanguage}">${code.trimEnd()}</code></pre>`;
        codeBlocks.push(block);
        return `@@CODE_BLOCK_${codeBlocks.length - 1}@@`;
      },
    );

    content = content
      .replace(/^###### (.*)$/gm, '<h6>$1</h6>')
      .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
      .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_match, label, href) =>
          `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      );

    content = this.renderListBlocks(content, /^- (.*)$/gm, 'ul');
    content = this.renderListBlocks(content, /^\d+\. (.*)$/gm, 'ol');

    const blocks = content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .map((block) => {
        if (this.isBlockHtml(block)) {
          return block;
        }
        return `<p>${block.replace(/\n/g, '<br />')}</p>`;
      });

    return blocks
      .join('\n')
      .replace(
        /@@CODE_BLOCK_(\d+)@@/g,
        (_match, index) => codeBlocks[Number(index)] ?? '',
      );
  }

  private renderListBlocks(
    content: string,
    regex: RegExp,
    listTag: 'ul' | 'ol',
  ) {
    const lines = content.split('\n');
    const rendered: string[] = [];
    let currentItems: string[] = [];

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        currentItems.push(`<li>${match[1]}</li>`);
        continue;
      }
      if (currentItems.length > 0) {
        rendered.push(`<${listTag}>${currentItems.join('')}</${listTag}>`);
        currentItems = [];
      }
      rendered.push(line);
    }

    if (currentItems.length > 0) {
      rendered.push(`<${listTag}>${currentItems.join('')}</${listTag}>`);
    }

    return rendered.join('\n');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isBlockHtml(block: string): boolean {
    return /^(<h\d|<ul>|<ol>|<li>|<pre>|<blockquote>|@@CODE_BLOCK_)/.test(
      block,
    );
  }
}
