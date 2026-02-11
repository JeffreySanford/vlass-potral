import { describe, expect, it } from 'vitest';
import { renderSafeMarkdownHtml } from './markdown-renderer';

describe('renderSafeMarkdownHtml', () => {
  it('drops non-http links from markdown output', () => {
    const html = renderSafeMarkdownHtml(
      '[bad](javascript:alert(1)) and [good](https://example.com)',
      () => '<div class="preview-viewer-block">viewer</div>',
    );

    expect(html).toContain('<span>bad</span>');
    expect(html).toContain('https://example.com/');
    expect(html).not.toContain('javascript:alert');
  });
});
