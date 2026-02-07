# Server-Side Rendering (SSR) Strategy

## Overview

VLASS Portal uses Angular Universal SSR to deliver a fast initial render (shell + background preview) while deferring viewer engine initialization, WebSocket subscriptions, and interactive state to the client.

**Key principle:** SSR is not about rendering Aladin. SSR is about **meaningful paint speed** and **initial state hydration**.

---

## What Renders Server-Side

### HTML Shell

- Navigation header
- Logo + title
- Disabled viewer controls (buttons appear grayed out)
- Fallback text: "Loading viewer..."

### Config + Initial State (injected via TransferState)

- `publicConfig` (epochs, surveys, feature flags)
- `initialViewerState` (RA/Dec, FOV, epoch, mode)
- `attributionText` for background preview

### Background Preview Image

- Pre-computed PNG tile (or static fallback SVG)
- Derived from `initialViewerState` coordinates
- Served as CSS background-image or `<img>`
- Fade-transition when Aladin loads

### User Session State (if authenticated)

- JWT token from cookie (optional)
- User roles (from `SessionStorage` or none for anon)
- Auth state (logged-in vs. anon)

---

## What Remains Client-Only

### Viewer Engines

- **Aladin Lite:** Full JavaScript library + CDS data streams
- **Canvas Mode B:** Custom rendering pipeline

### WebSocket Subscriptions

- Audit stream (watched by admins)
- Moderation queue (watched by mods)
- Community feed updates
- User presence

### Interactive State

- Pan/zoom handlers (track mouse/touch events)
- Search input binding + autocomplete
- Post editor forms
- Real-time validation feedback

### Network Requests That Depend on Client State

- Manifest fetch (recomputed on pan/zoom)
- Tile streaming (dynamic based on window scroll/view)
- Comment publishing (after user action, not SSR-time)

---

## Hydration Timeline

```text
┌────────────────────────────────────────────────────────────────┐
│ T0: Server Renders (50-100ms)                                  │
│  • Generate HTML shell + stylesheet                            │
│  • Serialize initialViewerState + publicConfig to TransferState│
│  • Compute/fetch background preview PNG                        │
│  • Return HTML to client                                       │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ T1–T2: Client Boot + Transfer Extraction (0-200ms)             │
│  • Browser parses HTML                                         │
│  • Angular initializes                                         │
│  • TransferState extracts + ViewerStateHydrator reads initial  │
│  • Store initialized with server values                        │
│  • CSS background shows preview image                          │
│  • "First Contentful Paint" (FCP) complete                     │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ T2–T3: Hydration Checkpoint + Viewer Init (200-800ms)          │
│  • @angular/platform-browser calls hydration checkpoint        │
│  • Viewer control buttons become enabled                       │
│  • Aladin Lite bundle loads (async)                            │
│  • Canvas fallback queued if Aladin > 5s                       │
│  • "Largest Contentful Paint" (LCP) starts                     │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ T3–T4: WebSocket & Interactive State (800-1500ms)              │
│  • Aladin script finishes loading                              │
│  • Viewer mounts into pre-rendered container                   │
│  • WS connection established (after hydration)                 │
│  • Audit stream subscriptions active (if admin)                │
│  • "Fully Interactive" (TTI)                                   │
└────────────────────────────────────────────────────────────────┘
```

---

## TransferState Keys & Serialization

Define shared constant in `libs/shared/models/ssr.ts`:

```typescript
import { makeStateKey } from '@angular/platform-browser';
import { ViewerState, ConfigPublic } from './index';

/** SSR → Client serialization keys */
export const SSR_KEYS = {
  VIEWER_STATE: makeStateKey<ViewerState>('VLASS_VIEWER_STATE_V1'),
  PUBLIC_CONFIG: makeStateKey<ConfigPublic>('VLASS_PUBLIC_CONFIG_V1'),
  PREVIEW_URL: makeStateKey<string>('VLASS_PREVIEW_URL_V1'),
  HOME_ATTRIBUTION: makeStateKey<string>('VLASS_ATTRIBUTION_V1'),
} as const;

export type SSRPayload = {
  [key in keyof typeof SSR_KEYS]: any;
};
```

### ViewerState Payload

```json
{
  "epoch": "MedianStack",
  "center": {
    "raDeg": 40.5,
    "decDeg": -75.5
  },
  "fovDeg": 2.0,
  "mode": "ALADIN",
  "imageFormat": "PNG",
  "overlays": [],
  "timestampUtc": "2026-02-06T20:10:00Z"
}
```

### ConfigPublic Payload

```json
{
  "epochs": ["MedianStack", "VLASS2.1", "VLASS2.2"],
  "defaultEpoch": "MedianStack",
  "surveys": [
    {
      "name": "VLASS Median Stack",
      "hipsUrl": "https://vlass-dl.nrao.edu/vlass/HiPS/MedianStack"
    }
  ],
  "features": {
    "dualViewerEnabled": true,
    "communityEnabled": true
  },
  "rateLimitInfo": {
    "anonRPM": 20,
    "verifiedRPM": 300
  }
}
```

---

## Implementation: Server-Side

### NestJS Renderer

```typescript
// apps/vlass-api/src/app/ssr/ssr.service.ts

import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { renderToString } from '@angular/platform-server';
import { AppModule } from '../app.module';
import { ConfigService } from '../config/config.service';
import { ViewerService } from '../viewer/viewer.service';
import { SSR_KEYS } from '@shared/models/ssr';
import { TransferState } from '@angular/platform-browser';

@Injectable()
export class SsrService {
  constructor(
    private readonly config: ConfigService,
    private readonly viewer: ViewerService,
  ) {}

  async render(req: Request, res: Response): Promise<string> {
    try {
      // 1. Extract query params + cookies
      const epoch = req.query.epoch || 'MedianStack';
      const mode = req.query.mode || 'ALADIN';
      const locationCookie = req.cookies['vlass_location'];

      // 2. Build initial ViewerState
      const initialViewerState = {
        epoch,
        center: parseLocationCookie(locationCookie) || { raDeg: 0, decDeg: 90 },
        fovDeg: 2.0,
        mode,
        imageFormat: 'PNG',
        overlays: [],
        timestampUtc: new Date().toISOString(),
      };

      // 3. Fetch background preview (fast path; timeout = 1s)
      const previewUrl = await this.viewer
        .previewUrl(initialViewerState, { timeout: 1000 })
        .toPromise();

      // 4. Build TransferState
      const transferState = new TransferState();
      transferState.set(SSR_KEYS.VIEWER_STATE, initialViewerState);
      transferState.set(SSR_KEYS.PUBLIC_CONFIG, this.config.publicConfig());
      transferState.set(SSR_KEYS.PREVIEW_URL, previewUrl);
      transferState.set(SSR_KEYS.HOME_ATTRIBUTION, 'VLASS / NRAO');

      // 5. Render app with platform-server
      const html = await renderToString(AppModule, {
        req,
        res,
        transferState,
      });

      return html;
    } catch (err) {
      // Fallback to shell (no config hydration)
      return this.shellFallback();
    }
  }

  private shellFallback(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>VLASS Sky Portal</title>
        </head>
        <body>
          <app-root></app-root>
          <script src="main.js"></script>
        </body>
      </html>
    `;
  }
}
```

### NestJS Route

```typescript
// apps/vlass-api/src/app/ssr/ssr.controller.ts

@Controller()
export class SsrController {
  constructor(private readonly ssr: SsrService) {}

  @Get('/')
  async home(@Req() req: Request, @Res() res: Response): Promise<void> {
    const html = await this.ssr.render(req, res);
    res.send(html);
  }

  @Get('/viewer')
  async viewer(@Req() req: Request, @Res() res: Response): Promise<void> {
    const html = await this.ssr.render(req, res);
    res.send(html);
  }

  @Get('/community')
  async community(@Req() req: Request, @Res() res: Response): Promise<void> {
    const html = await this.ssr.render(req, res);
    res.send(html);
  }
}
```

---

## Implementation: Client-Side

### Hydration Service

```typescript
// apps/vlass-web/src/app/core/ssr/viewer-state-hydrator.ts

import { Injectable } from '@angular/core';
import { TransferState } from '@angular/platform-browser';
import { SSR_KEYS } from '@shared/models/ssr';
import { ViewerStateStore } from '@shared/data-access/viewer-state';

@Injectable({ providedIn: 'root' })
export class ViewerStateHydrator {
  private hydrated = false;

  constructor(
    private readonly transfer: TransferState,
    private readonly store: ViewerStateStore,
  ) {}

  hydrate(): void {
    if (this.hydrated) return;

    const initialState = this.transfer.get(SSR_KEYS.VIEWER_STATE, null);
    const config = this.transfer.get(SSR_KEYS.PUBLIC_CONFIG, null);

    if (initialState) {
      this.store.initializeFromServer(initialState);
      this.transfer.remove(SSR_KEYS.VIEWER_STATE);
    }

    if (config) {
      // Store config globally or in service
      // this.configService.set(config);
      this.transfer.remove(SSR_KEYS.PUBLIC_CONFIG);
    }

    this.hydrated = true;
  }
}
```

### App Component (Bootstrap)

```typescript
// apps/vlass-web/src/app/app.component.ts

import { Component, OnInit, NgZone } from '@angular/core';
import { ViewerStateHydrator } from './core/ssr/viewer-state-hydrator';
import { ViewerStateStore } from '@shared/data-access/viewer-state';

@Component({
  selector: 'app-root',
  template: `
    <div class="app-container">
      <app-header></app-header>
      <div class="main-content">
        <router-outlet></router-outlet>
      </div>
      <app-footer></app-footer>
    </div>
  `,
  stylesheet: ['./app.scss'],
})
export class AppComponent implements OnInit {
  constructor(
    private readonly hydrator: ViewerStateHydrator,
    private readonly store: ViewerStateStore,
    private readonly ngZone: NgZone,
  ) {
    // Hydrate BEFORE view initialization
    this.hydrator.hydrate();
  }

  ngOnInit(): void {
    // Mark hydration checkpoint
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        console.log('[SSR] Hydration checkpoint reached');
        this.ngZone.run(() => {
          // Enable interactive controls after hydration
          document.body.classList.add('hydrated');
        });
      });
    }
  }
}
```

### Viewer Component (Respects Hydration)

```typescript
// apps/vlass-web/src/app/viewer/viewer.component.ts

import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ViewerStateStore } from '@shared/data-access/viewer-state';
import { Observable } from 'rxjs';
import { ViewerState } from '@shared/models';

@Component({
  selector: 'app-viewer',
  template: `
    <div class="viewer-wrapper">
      <!-- Background preview (from SSR) -->
      <div
        class="viewer-background"
        [style.backgroundImage]="backgroundUrl$ | async"
      ></div>

      <!-- Disabled during hydration -->
      <div class="viewer-controls" [class.disabled]="!hydrated">
        <button [disabled]="!hydrated" (click)="centerOnObject()">
          Recenter
        </button>
      </div>

      <!-- Viewer container (mounted client-side) -->
      <div
        #viewerContainer
        class="viewer-container"
        data-test-id="aladin-viewer"
      ></div>
    </div>
  `,
  styleUrls: ['./viewer.component.scss'],
})
export class ViewerComponent implements OnInit, AfterViewInit {
  hydrated = false;
  backgroundUrl$: Observable<string>;
  state$: Observable<ViewerState>;

  constructor(private readonly store: ViewerStateStore) {
    this.state$ = this.store.state$;
  }

  ngOnInit(): void {
    document.addEventListener('DOMContentLoaded', () => {
      this.hydrated = true;
    });
  }

  ngAfterViewInit(): void {
    // Only initialize Aladin AFTER hydration checkpoint
    if (this.hydrated) {
      this.initializeAladin();
    } else {
      setTimeout(() => this.initializeAladin(), 100);
    }
  }

  private initializeAladin(): void {
    // Load Aladin Lite script + mount viewer
    // See ALADIN-DEPENDENCY.md for timeout + fallback
  }

  centerOnObject(): void {
    // Pan to location
  }
}
```

---

## Hydration Conflict Handling

### Race: User Pans Before Hydration

**Scenario:** Client finishes rendering skeleton BUT hydration not yet complete; user clicks pan button.

**Solution:**

- Viewer controls visually disabled (CSS + `[disabled]` binding)
- Click handler silently no-ops if `!this.hydrated`
- User cannot queue pan events before store is live

### Race: Pan During SSR

**Not a race:** SSR doesn't render Aladin, so no pan occurs server-side. The skeleton is static.

---

## Aladin Load Timeout & Fallback

If Aladin Lite fails to initialize within 5 seconds:

```typescript
// Pseudo-code; see ALADIN-DEPENDENCY.md for full impl
initializeAladin(timeout = 5000) {
  this.aladinLoadTimer = setTimeout(() => {
    console.warn("[Viewer] Aladin timeout; switching to Mode B");
    this.store.setMode("CANVAS");
    this.initializeCanvasViewer();
  }, timeout);

  loadScript("https://.../aladin-lite.js")
    .then(() => {
      clearTimeout(this.aladinLoadTimer);
      this.mountAladin();
    })
    .catch((err) => {
      console.error("[Viewer] Aladin load failed", err);
      this.store.setMode("CANVAS");
      this.initializeCanvasViewer();
    });
}
```

---

## Testing

### Jest Unit Tests

```typescript
// libs/data-access/viewer-state/src/viewer-state-hydrator.spec.ts

describe('ViewerStateHydrator', () => {
  let hydrator: ViewerStateHydrator;
  let transfer: TransferState;
  let store: ViewerStateStore;

  beforeEach(() => {
    transfer = new TransferState();
    store = new ViewerStateStore();
    hydrator = new ViewerStateHydrator(transfer, store);
  });

  it('should extract initialViewerState from TransferState', () => {
    const state = { epoch: 'MedianStack', center: { raDeg: 0, decDeg: 90 } };
    transfer.set(SSR_KEYS.VIEWER_STATE, state);

    hydrator.hydrate();

    expect(store.state.value.epoch).toBe('MedianStack');
  });

  it('should remove key after extraction', () => {
    transfer.set(SSR_KEYS.VIEWER_STATE, {});
    hydrator.hydrate();

    expect(transfer.hasKey(SSR_KEYS.VIEWER_STATE)).toBe(false);
  });

  it('should be idempotent (second hydrate is no-op)', () => {
    hydrator.hydrate();
    const firstCall = store.state.value;

    hydrator.hydrate();
    const secondCall = store.state.value;

    expect(firstCall).toBe(secondCall);
  });
});
```

### Playwright E2E Tests

```typescript
// apps/vlass-web-e2e/src/ssr.spec.ts

import { test, expect } from '@playwright/test';

test.describe('SSR Hydration', () => {
  test('should render shell immediately', async ({ page }) => {
    const start = Date.now();
    await page.goto('http://localhost:4200');
    const fcp = Date.now() - start;

    // First Contentful Paint should be < 500ms
    expect(fcp).toBeLessThan(500);

    // Title should be visible
    await expect(page.locator('h1')).toContainText('VLASS Sky Portal');
  });

  test('should hydrate viewer controls after load', async ({ page }) => {
    await page.goto('http://localhost:4200/viewer');

    // Initially disabled
    const recenterBtn = page.locator("button[name='recenter']");
    expect(await recenterBtn.isDisabled()).toBe(true);

    // Wait for hydration checkpoint
    await page.waitForLoadState('networkidle');

    // Re-check; should be enabled
    expect(await recenterBtn.isDisabled()).toBe(false);
  });

  test('should show background preview while Aladin loads', async ({
    page,
  }) => {
    await page.goto('http://localhost:4200/viewer');

    const bg = await page.locator('.viewer-background');
    const bgImage = await bg.evaluate(
      (el) => window.getComputedStyle(el).backgroundImage,
    );

    // Background image should be set from SSR
    expect(bgImage).toContain('url');
  });

  test('should fallback to Mode B if Aladin timeout', async ({ page }) => {
    // Block Aladin script
    await page.route('**/aladin-lite.js', (route) => route.abort());

    await page.goto('http://localhost:4200/viewer');
    await page.waitForTimeout(6000);

    // Should have switched to Canvas
    const canvasViewer = page.locator('[data-test-id="canvas-viewer"]');
    await expect(canvasViewer).toBeVisible();
  });
});
```

---

## Performance Targets

| Metric                         | Target  | Notes                |
| ------------------------------ | ------- | -------------------- |
| First Contentful Paint (FCP)   | < 500ms | Shell + preview      |
| Largest Contentful Paint (LCP) | < 2s    | Aladin visible       |
| Time to Interactive (TTI)      | < 3s    | Aladin ready for pan |
| Cumulative Layout Shift (CLS)  | < 0.1   | No jumpy hydration   |

---

## References

- [Angular Universal SSR Docs](https://angular.io/guide/universal)
- [Web Vitals (Google)](https://web.dev/vitals/)
- [TransferState (Angular Docs)](https://angular.io/api/platform-browser/TransferState)

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. SSR is NOT about rendering Aladin. It's about shell + preview speed.
2. Hydration is a client-side contract. Store must exist before viewer mounts.
3. Aladin timeout triggers Mode B fallback (see ALADIN-DEPENDENCY.md).
4. Background preview makes the initial render feel complete.
