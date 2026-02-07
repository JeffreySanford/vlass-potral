# Aladin Lite Dependency Guide

## Overview

Aladin Lite is a lightweight JavaScript library for viewing astronomical images and WCS data. VLASS Portal uses it to display survey data.

**Repo:** <https://github.com/cds-astro/aladin-lite>

---

## Installation & Setup

### Package Install

```bash
cd apps/vlass-web
npm install aladin-lite
```

### Import in Application

```typescript
// apps/vlass-web/src/app/tap-viewer/tap-viewer.component.ts

import * as Aladin from 'aladin-lite';

@Component({
  selector: 'app-tap-viewer',
  template: `<div id="aladin-lite-div"></div>`,
})
export class TapViewerComponent implements OnInit {
  ngOnInit(): void {
    const aladin = A.aladin('#aladin-lite-div', {
      survey: 'P/DSS2/color',
      fov: 10,
      reticleColor: '#ff89ff',
      showSharecontrol: false,
    });
  }
}
```

---

## Common Configuration

```typescript
interface AladinConfig {
  // Survey to display
  survey: string;
  // e.g., "P/DSS2/color", "P/SDSS9/color", "P/Planck/CMB"

  // Field of view in degrees
  fov: number;

  // Right ascension (J2000 degrees)
  ra?: number;

  // Declination (J2000 degrees)
  dec?: number;

  // Show reticle (crosshair)
  showReticle?: boolean;
  reticleColor?: string;

  // Show coordinates on hover
  showCooFrame?: boolean;

  // Enable zoom controls
  showZoomControl?: boolean;

  // Share button
  showShareControl?: boolean;

  // FITS display options
  showFitsCtrl?: boolean;
}
```

---

## Interacting with Aladin

### Center on Coordinates

```typescript
const aladin = A.aladin('#aladin-lite-div', {
  survey: 'P/DSS2/color',
});

// Center and zoom to specific RA, Dec
aladin.gotoRaDec(206.3, 35.87);

// Set field of view
aladin.setFoV(5); // 5 degrees

// Zoom in/out
aladin.setZoom(2);
```

### Adding Overlays (WCS Regions)

```typescript
// Load a catalog or region file
const catalog = A.catalogFromURL('s3://vlass-surveys/region_123.vot');
aladin.addCatalog(catalog);

// Custom catalog from GeoJSON
const catalog = A.catalog({
  name: 'WCS Sources',
});

// Add source objects
catalog.addSources(
  A.source(206.3, 35.87, { name: 'Source 1' }),
  A.source(206.4, 35.88, { name: 'Source 2' }),
);

aladin.addCatalog(catalog);
```

### FITS Image Overlay

```typescript
// Overlay FITS data
const fits = await A.fitsImage('s3://vlass-artifacts/image.fits');
aladin.addImageLayer('FITS', fits);
```

### Listen to Interactions

```typescript
aladin.on('click', (object) => {
  if (object) {
    console.log(`Clicked: ${object.x}, ${object.y}`);
  }
});

aladin.on('objectsSelected', (objects) => {
  console.log(`Selected ${objects.length} objects`);
  console.log(objects[0].data);
});
```

---

## Performance Optimization

### Lazy Load Aladin

```typescript
// apps/vlass-web/src/app/tap-viewer/tap-viewer.component.ts

export class TapViewerComponent implements OnInit {
  @ViewChild('aladinContainer') container!: ElementRef;

  async ngOnInit(): Promise<void> {
    // Lazy load script
    const Aladin = await import('aladin-lite');

    // Initialize after container renders
    setTimeout(() => {
      new Aladin.aladin(this.container.nativeElement, {
        survey: 'P/DSS2/color',
      });
    }, 100);
  }
}
```

### Limit Overlay Size

```typescript
// Only load first 1000 sources (Aladin can lag with large catalogs)
const sources = await this.api
  .getSources(ra, dec, radius)
  .pipe(map((sources) => sources.slice(0, 1000)));
```

### Debounce Panning

```typescript
let panTimeout: NodeJS.Timeout;

aladin.on('panchanged', () => {
  clearTimeout(panTimeout);
  panTimeout = setTimeout(() => {
    // Refresh overlays after pan stops
    this.loadOverlays(aladin.getRa(), aladin.getDec());
  }, 500);
});
```

---

## Known Issues & Workarounds

### Issue: Black Canvas in SSR

**Problem:** Aladin requires DOM, breaks Angular SSR.

**Fix:**

```typescript
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export class TapViewerComponent implements OnInit {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const Aladin = require('aladin-lite');
    // Initialize safely
  }
}
```

### Issue: Memory Leak on Component Destroy

**Problem:** Aladin keeps references after unmount.

**Fix:**

```typescript
ngOnDestroy(): void {
  // Clean up Aladin instance
  if (this.aladin) {
    this.aladin.removeLayers(this.aladin.getLayers());
    // Clear event listeners
    this.aladin.off("click");
    this.aladin.off("objectsSelected");
  }
}
```

### Issue: FITS Headers Not Loaded

**Problem:** FITS metadata sometimes unavailable.

**Fix:**

```typescript
// Always check header before accessing
const fits = await A.fitsImage(url);
if (fits.header) {
  console.log(fits.header.NAXIS);
} else {
  console.warn('FITS header not available');
}
```

---

## Testing with Aladin

```typescript
// apps/vlass-web-e2e/src/tap-viewer.e2e.ts

describe('TAP Viewer (Aladin)', () => {
  beforeEach(async () => {
    await page.goto('http://localhost:4200/tap-viewer');
    await page.waitForSelector('#aladin-lite-div');
  });

  it('should render Aladin viewer', async () => {
    const canvas = await page.$('canvas');
    expect(canvas).toBeTruthy();
  });

  it('should pan to RA/Dec', async () => {
    await page.evaluate(() => {
      window.aladin.gotoRaDec(206.3, 35.87);
    });

    // Verify canvas redraws
    await page.waitForTimeout(500);
    const canvas = await page.$('canvas');
    expect(canvas).toBeTruthy();
  });

  it('should load WCS overlay', async () => {
    await page.evaluate(() => {
      const cat = window.A.catalog();
      cat.addSource(window.A.source(206.3, 35.87));
      window.aladin.addCatalog(cat);
    });

    // Verify overlay rendered
    const canvases = await page.$$('canvas');
    expect(canvases.length).toBeGreaterThan(1);
  });
});
```

---

## Version Pinning

We pin Aladin to a stable version in `package.json`:

```json
{
  "dependencies": {
    "aladin-lite": "^1.2.0"
  }
}
```

### Upgrade Path

1. **Test locally** with new version
2. **Check changelog** for breaking changes
3. **Run e2e tests** to verify overlay functionality
4. **Merge to main** with update commit

```bash
npm update aladin-lite
npm test
git commit -am "chore: upgrade aladin-lite to 1.3.0"
```

---

## Accessibility

Aladin is purely visual. Provide alternative text:

```typescript
<div role="img" aria-label="Sky map viewer showing astronomical image">
  <div id="aladin-lite-div"></div>
</div>

<button (click)="downloadFITS()" aria-label="Download FITS image">
  Export FITS
</button>
```

---

**Last Updated:** 2026-02-06

**Key:** Lazy load, limit overlays to 1K sources, cleanup on destroy, test coverage.
