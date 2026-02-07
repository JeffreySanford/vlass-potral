# VLASS Public Datasets & Access Points

## Overview

VLASS (VLA Sky Survey) is a public radio survey providing high-quality sky imagery in the 2–4 GHz band. This document catalogs the publicly available VLASS data products and their intended access patterns.

## Data Products Available

### 1. Quick Look (QL) Images

**What it is:**
1×1 degree images of 2–4 GHz Stokes I continuum, plus RMS images, organized by tile and epoch.

**Quality note (important):**
Quick Look products use simplified algorithms and can have positional and flux density errors. Consult NRAO's QL user guide before scientific use. Suitable for exploration and education, not precision science.

**Where it lives:**

```text
https://vlass-dl.nrao.edu/vlass/quicklook/
```

**Structure:**

- Epoch folders (e.g., epoch1, epoch2)
- Per-tile FITS files + associated RMS images
- Directory listing: `listing.txt` (large; contains metadata for ingestion)

**Use case for app:**
Fast PNG preview for SSR first paint; ideal for "quick background" rendering.

### 2. HiPS (Hierarchical Progressive Survey) Imagery

**What it is:**
Tiled, multi-resolution sky imagery designed for progressive zoom/pan browsing (like Google Maps for the sky).

**Where it lives:**

```text
https://vlass-dl.nrao.edu/vlass/HiPS/
```

**Structure:**

- Root listing shows available epochs/stacks
- Example: `MedianStack`, `VLASS1.2v2`, `VLASS2.1`, `VLASS2.2`, etc.
- Each epoch subtree contains:
  - `properties` (metadata)
  - `metadata.xml`
  - Tile hierarchy (tile directories by HEALPix order)

**Critical guardrail (from NRAO):**
"Do not mirror any HiPS without agreement; do not mirror any HiPS with unclonable status."

**Use case for app:**
Primary viewer layer for Mode A (Aladin Lite) and Mode B canvas renderer; enables "60-second to sky map" experience.

### 3. Single Epoch (SE) Continuum Imaging Cache

**Where it lives:**

```text
https://vlass-dl.nrao.edu/vlass/se_continuum_imaging/
```

**Use case:**
Higher-fidelity images for specific epochs; optional later expansion.

### 4. NRAO Archive (Metadata Search)

**What it is:**
Metadata-only scripted access to the NRAO archive (VLA/VLBA/GBT). Queries cannot download via this interface; downloads still require the web AAT (Archive Access Tool).

**VO/TAP endpoint:**

```text
https://data-query.nrao.edu/tap
```

**Use case:**
Advanced "cone search / time range / observing config" discovery; links users to official NRAO AAT for access.

### 5. NRAO Archive Access Tool (AAT)

**Web interface (human-facing):**

```text
https://data.nrao.edu/
```

**Use case:**
Official download endpoint; your app links to this when users request full products.

### 6. CADC (Canadian Astronomy Data Centre) Services

**TAP (sync query):**

```text
https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync
```

**Direct Data Service (public downloads):**

```text
https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/data/pub/
```

**Use case:**
VLASS QL and SE products available via CADC; supports VO cutout/metadata queries.

### 7. CIRADA (Canadian Initiative for Radio Astronomy Data Analysis)

**Cutout service:**

```text
https://cutouts.cirada.ca
```

**Catalog repository:**

```text
https://cirada.ca
```

**Use case:**
NRAO points to CIRADA for VLASS QL cutouts and source catalogs (optional, future expansion).

## Object Name Resolver

### CDS Sesame

**Purpose:** Resolve object names (e.g., "M87") to RA/Dec coordinates.

**Endpoint:**

```text
https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp?{objectName}
```

**Supports:** XML as text/plain output via `-oxp` option.

**Use case:** User-friendly search ("find M87").

## Guardrails & Access Policies

### Public-Only Enforcement

- Use only endpoints explicitly documented as public VLASS/NRAO products.
- No access to proprietary/restricted data.
- Advanced queries (TAP, archive metadata) are metadata-only; downloads via AAT.

### HiPS Caching ("Not a Mirror")

NRAO explicitly warns:

- Do not mirror HiPS without agreement.
- Your caching must behave like a **bounded performance cache**:
  - On-demand only (no prefetching)
  - Small TTL (hours/days)
  - Hard size caps
  - Concurrency limits
  - User-agent identification
  - Respect upstream cache headers

### Rate Limiting & Upstream Protection

- Sesame: reasonable throttle (avoid blacklisting; ~6 queries/sec max per SIMBAD guidance).
- TAP: enforce concurrency limits and backoff.
- Bulk-crawl detection: block tile-space scan patterns.

### Data Transparency

- Label Quick Look imagery as "exploratory" (not "live" and not "precision").
- Always attribute NRAO/VLASS in rendered views.
- Link to official NRAO documentation for limitations.

### Location Privacy

- Overhead sky feature is SSR-driven after user consent.
- Store coarse location only (rounded/geohash); never raw GPS.
- Audit logs redact location.

## Default Configuration (MVP)

```text
Default layer: MedianStack

Default epoch: MedianStack (most complete for non-astronomers)

Fallback: if VLASS coverage absent, show "no coverage" gracefully
```

## Future Dataset Expansion (Post-MVP)

- VLASS source catalogs (CIRADA)
- NRAO Archive metadata search UI
- VLBA / GBT products (if scope grows)
- Legacy surveys (NVSS, FIRST) as optional overlays

---

**Last Updated:** 2026-02-06

**Key Principle:** Public-only, no mirroring, bounded caching, always transparent about data provenance and limitations.
