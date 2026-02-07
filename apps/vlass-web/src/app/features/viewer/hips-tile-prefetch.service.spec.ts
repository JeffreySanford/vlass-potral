import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HipsTilePrefetchService } from './hips-tile-prefetch.service';

describe('HipsTilePrefetchService', () => {
  let service: HipsTilePrefetchService;
  let initialFetch: typeof globalThis.fetch;

  beforeEach(() => {
    service = new HipsTilePrefetchService();
    initialFetch = globalThis.fetch.bind(globalThis);
  });

  afterEach(() => {
    service.deactivate();
    globalThis.fetch = initialFetch;
    vi.restoreAllMocks();
  });

  it('returns cached tile response on repeated requests', async () => {
    const networkFetch = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
        },
      });
    });
    globalThis.fetch = networkFetch as unknown as typeof globalThis.fetch;

    service.activate();
    const tileUrl = 'https://example.org/hips/Norder8/Dir0/Npix123.jpg';

    const first = await globalThis.fetch(tileUrl);
    expect(first.ok).toBe(true);

    const second = await globalThis.fetch(tileUrl);
    expect(second.ok).toBe(true);
    expect(second.headers.get('X-Vlass-Tile-Cache')).toBe('HIT');
  });

  it('restores original fetch behavior after deactivation', async () => {
    const baseFetch = vi.fn(async () => new Response('ok'));
    globalThis.fetch = baseFetch as unknown as typeof globalThis.fetch;

    service.activate();
    expect(globalThis.fetch).not.toBe(baseFetch);

    service.deactivate();
    await globalThis.fetch('https://example.org/ping');
    expect(baseFetch).toHaveBeenCalled();
  });
});
