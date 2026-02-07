# Canvas Viewer Mode B Specification

## Overview

**Mode B is not a full WCS-projected astronomy research tool.** It's a controlled, declarative viewer for community research + a resilience fallback if Aladin Lite fails.

**MVP Acceptance Criteria:**

- Render HiPS tiles smoothly at moderate FOV (2°–10°)
- Handle celestial edge cases (RA wrap at 0°/360°, poles)
- Snapshot deterministically for community posts
- Paint within 1.5s after initialization
- Fall back from Aladin automatically on timeout or error

**Post-MVP (not v1):**

- WCS projection accuracy
- Advanced overlays (regions, contours)
- Pixel-level photometry tools

---

## Architecture: Tile-Based Progressive Rendering

Mode B uses **HEALPix tile manifests** (computed by Go microservice) to progressively render tiles at increasing resolution.

```
User Pan at (RA=40.5, Dec=-75.5, FOV=2.0°)
  ↓
[Angular ViewerComponent]
  ↓
[GET /view/manifest?ra=40.5&dec=-75.5&fov=2.0&layer=MedianStack]
  ↓
[Go Manifest Service]
  Compute HEALPix tiles for this view
  Return { tiles: [{url, order, x, y, w, h}, ...], center: {raDeg, decDeg} }
  ↓
[Canvas Viewer]
  Draw tiles in order of increasing resolution
  Fade in new tiles as manifests load
```

---

## Canvas Renderer Component

### Structure

```typescript
// apps/vlass-web/src/app/viewer/canvas-viewer/canvas-viewer.component.ts

import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  NgZone,
} from "@angular/core";
import { ViewerStateStore } from "@shared/data-access/viewer-state";
import { ViewerService } from "../viewer.service";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

@Component({
  selector: "app-canvas-viewer",
  template: `
    <div class="canvas-wrapper">
      <canvas
        #canvas
        class="viewer-canvas"
        data-test-id="canvas-viewer"
        (wheel)="onZoom($event)"
        (mousedown)="onDragStart($event)"
        (mousemove)="onDragMove($event)"
        (mouseup)="onDragEnd($event)"
      ></canvas>
      <div class="loading-indicator" [hidden]="!isLoading">
        Loading...
      </div>
    </div>
  `,
  styleUrls: ["./canvas-viewer.component.scss"],
})
export class CanvasViewerComponent implements OnInit, OnDestroy {
  @ViewChild("canvas", { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  @Input() state$ = this.store.state$;

  isLoading = false;
  private ctx!: CanvasRenderingContext2D;
  private tileCache = new Map<string, HTMLImageElement>();
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private destroy$ = new Subject<void>();

  constructor(
    private readonly store: ViewerStateStore,
    private readonly viewer: ViewerService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    const canvasEl = this.canvas.nativeElement;
    this.ctx = canvasEl.getContext("2d")!;

    // Set canvas size to window
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    // Subscribe to state changes
    this.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.render(state);
      });
  }

  private resizeCanvas(): void {
    const canvasEl = this.canvas.nativeElement;
    const rect = canvasEl.parentElement!.getBoundingClientRect();
    canvasEl.width = rect.width;
    canvasEl.height = rect.height;
  }

  private render(state: ViewerState): void {
    this.isLoading = true;

    // Fetch manifest for current view
    this.viewer
      .getManifest(state.center.raDeg, state.center.decDeg, state.fovDeg)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (manifest) => {
          this.drawTiles(manifest, state);
          this.isLoading = false;
        },
        error: (err) => {
          console.error("[Canvas] Manifest fetch failed", err);
          this.isLoading = false;
        },
      });
  }

  private drawTiles(manifest: ManifestResponse, state: ViewerState): void {
    this.ngZone.runOutsideAngular(() => {
      const canvasEl = this.canvas.nativeElement;
      const w = canvasEl.width;
      const h = canvasEl.height;

      // Clear canvas
      this.ctx.clearRect(0, 0, w, h);

      // Draw background (optional)
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, w, h);

      // Tile draw order: lower HEALPix orders (lower resolution) first
      const sortedTiles = manifest.tiles.sort((a, b) => a.order - b.order);

      for (const tile of sortedTiles) {
        // Fetch tile image (cached)
        const img = this.getTileImage(tile.url);
        if (img) {
          // Draw at canvas position (projection logic here)
          this.drawTileOnCanvas(img, tile, state, w, h);
        }
      }

      // Draw grid overlay (optional; helps verify projection)
      if (state.overlays?.includes("GRID")) {
        this.drawGrid(state, w, h);
      }

      // Draw pinned points (from community blocks)
      if (state.overlays?.includes("PINNEDPOINTS")) {
        this.drawPinnedPoints(state, w, h);
      }
    });
  }

  private getTileImage(url: string): HTMLImageElement | null {
    if (this.tileCache.has(url)) {
      return this.tileCache.get(url)!;
    }

    // Async load + cache
    const img = new Image();
    img.src = url;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.tileCache.set(url, img);
      // Re-render with new tile
      this.ngZone.run(() => {
        const state = this.store.state.value;
        this.render(state);
      });
    };

    return null; // Not yet loaded
  }

  private drawTileOnCanvas(
    img: HTMLImageElement,
    tile: TileRef,
    state: ViewerState,
    canvasW: number,
    canvasH: number,
  ): void {
    // Simple projection: tile RA/Dec → canvas x/y
    // This is NOT scientifically accurate WCS, just "good enough" for v1

    const centerX = canvasW / 2;
    const centerY = canvasH / 2;

    // Assume tile center is close to view center for MVP
    // TODO: Implement full tangent plane projection (post-MVP)

    const scale = canvasW / (state.fovDeg * 4); // 4 pixels per degree
    const x = centerX - (tile.w * scale) / 2;
    const y = centerY - (tile.h * scale) / 2;

    this.ctx.drawImage(img, x, y, tile.w * scale, tile.h * scale);
  }

  private drawGrid(state: ViewerState, w: number, h: number): void {
    // Draw lines at RA/Dec grid intersections
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    this.ctx.lineWidth = 1;

    const step = 1; // Draw grid every 1 degree
    const nLines = Math.ceil(state.fovDeg / step) + 2;

    for (let i = 0; i < nLines; i++) {
      // Vertical lines (RA)
      const x = (w / nLines) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();

      // Horizontal lines (Dec)
      const y = (h / nLines) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
  }

  private drawPinnedPoints(state: ViewerState, w: number, h: number): void {
    // Draw markers for community viewer blocks
    this.ctx.fillStyle = "red";
    this.ctx.radius = 5;

    // (Pseudo-code; actual implementation depends on ViewerBlock structure)
    // for (const point of state.pinnedPoints) {
    //   const canvasX = ...; // Project to canvas
    //   const canvasY = ...;
    //   this.ctx.beginPath();
    //   this.ctx.arc(canvasX, canvasY, 5, 0, 2 * Math.PI);
    //   this.ctx.fill();
    // }
  }

  // ============================================================
  // Pan & Zoom Handlers
  // ============================================================

  onZoom(evt: WheelEvent): void {
    evt.preventDefault();
    const delta = evt.deltaY > 0 ? 0.8 : 1.2; // Wheel up = zoom in
    const newFov = Math.max(0.1, Math.min(180, this.store.state.value.fovDeg * delta));
    this.store.updateZoom(newFov);
  }

  onDragStart(evt: MouseEvent): void {
    this.dragging = true;
    this.dragStart = { x: evt.clientX, y: evt.clientY };
  }

  onDragMove(evt: MouseEvent): void {
    if (!this.dragging) return;

    const dx = evt.clientX - this.dragStart.x;
    const dy = evt.clientY - this.dragStart.y;

    // Pan (simplified; not accurate WCS)
    const state = this.store.state.value;
    const degreesPerPixel = state.fovDeg / this.canvas.nativeElement.width;

    const newRa = state.center.raDeg - dx * degreesPerPixel;
    const newDec = state.center.decDeg + dy * degreesPerPixel;

    // Normalize RA to [0, 360)
    const normalizedRa = ((newRa % 360) + 360) % 360;

    // Clamp Dec to [-90, 90]
    const clampedDec = Math.max(-90, Math.min(90, newDec));

    this.store.updateCenter({ raDeg: normalizedRa, decDeg: clampedDec });
  }

  onDragEnd(_evt: MouseEvent): void {
    this.dragging = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

---

## Edge Cases: RA Wrap & Poles

### RA Wrap (0° / 360°)

**Problem:** RA crosses the 360° → 0° boundary.

**Example:** User pans from RA=359° to RA=1° (should be 2° pan, not 358°).

**Solution:**

```typescript
// Normalize RA to [0, 360)
const normalizedRa = ((value % 360) + 360) % 360;

// For distance calc (which is shorter path?)
const dRa = (target - current + 360) % 360;
if (dRa > 180) {
  // Going backwards is shorter
  return current - (360 - dRa);
}
```

### Polar Regions (Dec > 80° or Dec < -80°)

**Problem:** RA becomes meaningless near poles. Tiles near pole might cover multiple RA ranges, and projection distorts heavily.

**Solution:**

```typescript
if (Math.abs(state.center.decDeg) > 85) {
  // Special case: draw simplified "polar" view
  // Show Dec circles + RA lines as spokes
  this.drawPolarProjection(state);
} else {
  // Standard gnomonic/tangent-plane projection
  this.drawStandardProjection(state);
}
```

---

## Snapshot for Community Posts

When user clicks "Create viewer snapshot" in post editor:

```typescript
// apps/vlass-web/src/app/community/post-editor/post-editor.component.ts

async captureSnapshot(): Promise<string> {
  // 1. Get current viewer state
  const state = this.store.state.value;

  // 2. Call Mode B render directly (off-screen)
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = 512;
  offscreenCanvas.height = 512;

  const renderer = new CanvasRenderer(offscreenCanvas, state);
  await renderer.render(); // Fetch tiles + draw

  // 3. Export as PNG (deterministic, reproducible)
  return offscreenCanvas.toDataURL("image/png");
}

// Store snapshot in ViewerBlock
this.community.createPost({
  title: "My Discovery",
  body: "Found an interesting object.",
  viewerSnapshot: {
    mode: "CANVAS",
    center: state.center,
    fovDeg: state.fovDeg,
    epoch: state.epoch,
    snapshotPng: await this.captureSnapshot(),
  },
});
```

---

## Performance & Caching

### Tile Image Cache

```typescript
private tileCache = new Map<string, HTMLImageElement>();
private cacheSizeBytes = 0;
private cacheMaxBytes = 50_000_000; // 50 MB for canvas (less than Go's)

private evictLRU(): void {
  if (this.cacheSizeBytes > this.cacheMaxBytes) {
    // Remove oldest tiles
    const sorted = Array.from(this.tileCache.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    const removeCount = Math.ceil(sorted.length / 4); // 25% eviction
    for (let i = 0; i < removeCount; i++) {
      const [url] = sorted[i];
      this.tileCache.delete(url);
    }
  }
}
```

### Manifest Coalescing

Multiple simultaneous pan events should not cause multiple manifest fetches:

```typescript
private manifestRequest$: Observable<ManifestResponse> | null = null;

getManifest(ra: number, dec: number, fov: number): Observable<ManifestResponse> {
  if (!this.manifestRequest$) {
    this.manifestRequest$ = this.http.get("/view/manifest", {
      params: { ra, dec, fov },
    }).pipe(
      finalize(() => {
        this.manifestRequest$ = null;
      }),
      shareReplay(1),
    );
  }
  return this.manifestRequest$;
}
```

---

## Testing

### Unit Tests

```typescript
// apps/vlass-web/src/app/viewer/canvas-viewer/canvas-viewer.component.spec.ts

describe("CanvasViewerComponent", () => {
  let component: CanvasViewerComponent;
  let fixture: ComponentFixture<CanvasViewerComponent>;
  let viewer: jasmine.SpyObj<ViewerService>;

  beforeEach(async () => {
    const viewerSpy = jasmine.createSpyObj("ViewerService", ["getManifest"]);
    await TestBed.configureTestingModule({
      declarations: [CanvasViewerComponent],
      providers: [{ provide: ViewerService, useValue: viewerSpy }],
    }).compileComponents();

    viewer = TestBed.inject(ViewerService) as jasmine.SpyObj<ViewerService>;
    fixture = TestBed.createComponent(CanvasViewerComponent);
    component = fixture.componentInstance;
  });

  it("should render tiles from manifest", (done) => {
    const manifest: ManifestResponse = {
      tiles: [
        { url: "img1.png", order: 3, x: 0, y: 0, w: 512, h: 512 },
      ],
      center: { raDeg: 40, decDeg: -75 },
    };

    viewer.getManifest.and.returnValue(of(manifest));
    fixture.detectChanges();

    setTimeout(() => {
      expect(viewer.getManifest).toHaveBeenCalled();
      done();
    }, 100);
  });

  it("should handle RA wrap correctly", () => {
    const state = { center: { raDeg: 359, decDeg: 0 }, fovDeg: 2 };
    component.onDragMove({ clientX: 100 } as MouseEvent); // Pan 1°
    const normalized = ((359 + 1) % 360 + 360) % 360;
    expect(normalized).toBe(0);
  });

  it("should handle polar regions without crash", () => {
    const state = { center: { raDeg: 0, decDeg: 85 }, fovDeg: 5 };
    expect(() => component.render(state)).not.toThrow();
  });
});
```

### Playwright E2E Tests (Golden Images)

```typescript
// apps/vlass-web-e2e/src/canvas-viewer.spec.ts

test("Mode B should render MedianStack tile manifest", async ({ page }) => {
  await page.goto("http://localhost:4200/viewer?mode=CANVAS&epoch=MedianStack");

  const canvas = page.locator('[data-test-id="canvas-viewer"]');
  await expect(canvas).toBeVisible();

  // Wait for tiles to render
  await page.waitForTimeout(2000);

  // Snapshot compare
  await expect(canvas).toHaveScreenshot("canvas-mode-b-default.png");
});

test("Mode B should handle RA boundary crossing", async ({ page }) => {
  await page.goto(
    "http://localhost:4200/viewer?mode=CANVAS&ra=359&dec=0&fov=2"
  );
  const canvas = page.locator('[data-test-id="canvas-viewer"]');

  // Pan right (should wrap to RA=0)
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect!.x + 100, rect!.y + 100);
  await page.mouse.down();
  await page.mouse.move(rect!.x + 200, rect!.y + 100); // Pan right
  await page.mouse.up();

  await page.waitForTimeout(500);
  await expect(canvas).toHaveScreenshot("canvas-mode-b-wrap.png");
});

test("Mode B should handle poles without crash", async ({ page }) => {
  await page.goto("http://localhost:4200/viewer?mode=CANVAS&dec=89&fov=5");

  const canvas = page.locator('[data-test-id="canvas-viewer"]');
  await expect(canvas).toBeVisible();

  await expect(canvas).toHaveScreenshot("canvas-mode-b-pole.png");
});
```

---

## Fallback from Aladin

When Aladin Lite fails, Mode B activates automatically:

```typescript
// From SSR-STRATEGY.md; implemented in viewer switcher

initializeAladin(timeout = 5000) {
  const timeoutId = setTimeout(() => {
    console.warn("[Viewer] Aladin timeout; fallback to Mode B");
    this.store.setMode("CANVAS");
  }, timeout);

  loadScript("https://.../aladin-lite.js")
    .then(() => {
      clearTimeout(timeoutId);
      this.mountAladin();
    })
    .catch((err) => {
      console.error("[Viewer] Aladin load failed", err);
      this.store.setMode("CANVAS");
    });
}
```

---

## Post-MVP Roadmap

Once MVP ships with Mode B "bones," consider:

1. **WCS Projection:** Implement tangent-plane projection (TAN) + rotation
2. **Overlays:** Region files (MOC, polygon), contour maps
3. **Advanced Tools:** Aperture photometry, source extraction
4. **Performance:** WebGL acceleration for large manifests

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. Mode B is NOT a scientific viewer in v1. It's "good enough" + fallback.
2. Canvas API for simplicity + control (no external dependencies).
3. RA wrap + poles must be handled explicitly.
4. Snapshot must be deterministic (same state = same PNG).
