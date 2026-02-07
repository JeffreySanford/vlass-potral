# VLASS Portal

A public-access web portal for interactive exploration of the **Very Large Array Sky Survey (VLASS)** dataset.
MVP ships with three core pillars: **Server-Side Rendering** (SEO + performance), **Interactive Sky Viewer** (Aladin Lite), and **Community Notebooks** (reproducible astronomy).

**For MVP scope, decision locks, and feature roadmap, see [PRODUCT-CHARTER.md](./documentation/PRODUCT-CHARTER.md)**

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

For detailed setup instructions, see [QUICK-START.md](./documentation/QUICK-START.md).

---

## Project Structure

- **`apps/vlass-web`** — Angular SSR frontend (Material 3, Aladin Lite viewer)
- **`apps/vlass-api`** — NestJS backend (Postgres, Redis, Bull queue)
- **`apps/vlass-web-e2e`** — End-to-end tests (Playwright)
- **`apps/vlass-api-e2e`** — API integration tests (Jest)
- **`libs/shared/models`** — Shared TypeScript types and interfaces

---

## Key Documentation

### Architecture & Decisions

- [PRODUCT-CHARTER.md](./documentation/PRODUCT-CHARTER.md) — **MVP scope lock** (3 pillars, metrics, non-scope)
- [ADR-001](./documentation/adr/) — Audit retention policy (90-day hot only)
- [ADR-002](./documentation/adr/) — FITS access model (link-out, no redistribution)
- [ADR-003](./documentation/adr/) — Compute tier (optional Rust in v2+)
- [ADR-004](./documentation/adr/) — Three-tier architecture (Angular + NestJS + optional Rust)

### Developer Guides

- [CACHE-POLICY.md](./documentation/CACHE-POLICY.md) — Redis caching strategy (observations, metadata, tiles)
- [TESTING-STRATEGY.md](./documentation/TESTING-STRATEGY.md) — Unit, integration, E2E test coverage
- [HIPS-PIPELINE.md](./documentation/HIPS-PIPELINE.md) — HEALPix tile generation and serving
- [COMMUNITY-BLOCKS.md](./documentation/COMMUNITY-BLOCKS.md) — Notebook blocks and reproducibility

### Deployment & Operations

- [LOCATION-PRIVACY.md](./documentation/LOCATION-PRIVACY.md) — IP-based geolocation redaction
- [AUTH-VERIFICATION.md](./documentation/AUTH-VERIFICATION.md) — GitHub + email verification for verified posts

See [documentation/](./documentation/) for the full index.

---

## Technology Stack

**Frontend:** Angular 18 + Angular Universal (SSR) + Material 3 + SCSS  
**Backend:** NestJS + TypeScript + Postgres + Redis + Bull  
**Viewer:** Aladin Lite v3 (CDN) — no build required  
**Testing:** Jest (unit/API), Playwright (E2E), Vitest (models)  
**Deployment:** Kubernetes + Helm (VLA assumed infrastructure)  
**Monorepo:** Nx (inferred targets, optimized caching)

---

## Development Workflow

### Nx Workspace Commands

Run any task with Nx:

```bash
npx nx <target> <project-name>             # Single project
npx nx run-many --target=build --all       # All projects
npx nx affected --target=test              # Changed projects only
```

Common targets:

- `npx nx build [project]` — Compile and bundle
- `npx nx serve [project]` — Start dev server
- `npx nx test [project]` — Run unit tests
- `npx nx lint [project]` — Check code quality
- `npx nx graph` — Visualize dependency graph

See [Nx documentation](https://nx.dev) for advanced workflows (caching, distributed exec, CI integration).

### Project-Specific Tasks

**Frontend (vlass-web):**

```bash
npx nx serve vlass-web                    # Dev server (http://localhost:4200)
npx nx build vlass-web                    # Prod build (dist/apps/vlass-web)
npx nx test vlass-web                     # Unit + integration tests
```

**Backend (vlass-api):**

```bash
npx nx serve vlass-api                    # Dev server (http://localhost:3000)
npx nx test vlass-api --coverage          # Unit tests + coverage
```

**E2E:**

```bash
npx nx e2e vlass-web-e2e                  # Playwright tests (requires running servers)
npx nx e2e vlass-api-e2e                  # API integration tests
```

---

## Release & Versioning

To version and release the library use:

```bash
npx nx release
```

Pass `--dry-run` to see what would happen without actually releasing. [Learn more about Nx release &raquo;](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Keep TypeScript project references up to date

Nx automatically updates TypeScript [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) in `tsconfig.json` files to ensure they remain accurate based on your project dependencies (`import` or `require` statements). This sync is automatically done when running tasks such as `build` or `typecheck`, which require updated references to function correctly.

To manually trigger the process to sync the project graph dependencies information to the TypeScript project references, run the following command:

---

## CI/CD Setup

To connect to Nx Cloud for remote caching and CI optimization:

```bash
npx nx connect
```

Then configure your CI workflow:

```bash
npx nx g ci-workflow
```

[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

---

## Contributing

- Code style: ESLint + Prettier (run `pnpm lint`)
- Tests required: Unit tests for new features, E2E for critical paths
- Scope decisions locked: See [SCOPE-LOCK.md](./SCOPE-LOCK.md) for recent changes

---

## Resources

- [PRODUCT-CHARTER.md](./documentation/PRODUCT-CHARTER.md) — MVP scope & metrics
- [SCOPE-LOCK.md](./SCOPE-LOCK.md) — Recent decision changes
- [Nx documentation](https://nx.dev)
- [VLA VLASS Dataset](https://science.nrao.edu/science/vlass)
