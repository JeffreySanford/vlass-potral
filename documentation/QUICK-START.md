# Quick Start Guide for VLASS Sky Portal Development

This guide takes you from zero to a running development environment in ~15 minutes.

---

## Prerequisites

You need:

- **Node.js 18+** (use `nvm` to switch versions)
- **pnpm 9+** (`npm install -g pnpm`)
- **Go 1.20+** (for microservice)
- **PostgreSQL 14+** (production) or **SQLite** (dev, default)
- **Docker** (optional; for container support)
- **Git** (for version control)

Check your setup:

```bash
node --version     # v18+
pnpm --version     # 9.x+
go version         # go1.20+
psql --version     # psql 14+
docker --version   # Docker 20.10+
```

---

## 1. Clone & Install

```bash
# Navigate to your repos folder
cd ~/repos

# Clone the monorepo
git clone https://github.com/yourusername/vlass-portal.git
cd vlass-portal

# Install dependencies
pnpm install

# (pnpm workspaces will install all packages)
```

---

## 2. Create Local Environment Config

Create `.env.local` in `apps/vlass-api/`:

```bash
cat > apps/vlass-api/.env.local << 'EOF'
NODE_ENV=development

# Server
PORT=3333

# JWT
JWT_SECRET=dev-secret-change-me-in-prod
JWT_ISSUER=vlass-portal
JWT_AUDIENCE=vlass-portal-web

# Database (SQLite for dev)
DB_URL=sqlite:///./vlass.dev.db

# Upstream endpoints
VLASS_HIPS_BASE=https://vlass-dl.nrao.edu/vlass/HiPS
VLASS_QUICKLOOK_BASE=https://vlass-dl.nrao.edu/vlass/quicklook
NRAO_TAP_BASE=https://data-query.nrao.edu/tap
NRAO_AAT_BASE=https://data.nrao.edu
CDS_SESAME_BASE=https://cds.unistra.fr/cgi-bin/nph-sesame

# Allowlist
UPSTREAM_ALLOWLIST=vlass-dl.nrao.edu,data-query.nrao.edu,data.nrao.edu,vizier.u-strasbg.fr,cds.unistra.fr

# Cache settings
CACHE_MAX_BYTES=500000000
CACHE_TTL_SECONDS=3600
CACHE_MAX_CONCURRENCY=6

# Audit
AUDIT_RETENTION_DAYS=30

# Rate limits (requests per minute)
RATE_ANON_RPM=20
RATE_UNVERIFIED_RPM=60
RATE_VERIFIED_RPM=300
RATE_POWER_RPM=600
RATE_MOD_RPM=900
RATE_ADMIN_RPM=0

# Artifacts (local filesystem)
ARTIFACTS_DRIVER=filesystem
ARTIFACTS_BASE=./artifacts

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Dev email (tokens logged to console)
SMTP_HOST=
SMTP_PORT=587
EOF
```

---

## 3. Setup Database

### SQLite (default for dev)

```bash
# Just works; SQLite creates the DB file automatically on first connection
# See DATABASE-SCHEMA.md for schema
```

### PostgreSQL (if you prefer)

```bash
# Create a database
createdb vlass_dev

# Update .env.local
DB_URL=postgresql://postgres:password@localhost:5432/vlass_dev

# Run migrations (after code generation)
# (see step 5)
```

---

## 4. Generate NX Configuration

```bash
# Initialize Nx (if not already done)
pnpm nx init

# Generate workspace config
# (This will be done in a separate setup script)
```

---

## 5. Run the Dev Servers

Open three terminals:

### Terminal 1: Angular Web App

```bash
cd c:\repos\vlass-portal
pnpm nx serve vlass-web

# Server starts at http://localhost:4200
# Hot reload enabled; any .ts/.html/.scss changes auto-refresh
```

### Terminal 2: NestJS API / BFF

````bash
```bash
cd c:\repos\vlass-portal
pnpm nx serve vlass-api

# Server starts at http://localhost:3333
# Swagger API docs at http://localhost:3333/api
````

### Terminal 3 (Optional): Rust Render Service

**Note:** MVP does not require Rust for basic viewing. The Rust render service is optional for advanced PNG composition (snapshots). Skip this for now.

To enable Rust (v2+):

```bash
cd c:\repos\vlass-portal
cargo build --release -p vlass-render
./target/release/vlass-render

# Render service starts at http://localhost:8081
```

---

## 6. Verify Servers Are Running

```bash
# In a fourth terminal:

# Angular app
curl http://localhost:4200 | head -20

# Nest API
curl http://localhost:3333/config/public | jq .
```

---

---

## 7. Run Tests

```bash
# Unit tests for all projects
pnpm nx test

# Unit tests for one project
pnpm nx test apps/vlass-api

# With coverage
pnpm nx test --coverage

# E2E tests (requires servers running)
pnpm nx e2e vlass-api-e2e
pnpm nx e2e vlass-web-e2e

# Policy tests (must pass before merge!)
pnpm nx run tools-policy-tests:test
```

---

## 8. Build for Production

```bash
# Build all apps
pnpm nx build

# Build specific app
pnpm nx build vlass-api
pnpm nx build vlass-web
cd apps/vlass-go && go build -o vlass-go main.go

# Output goes to dist/ directory
# Apps/libs are tree-shaken and minified
```

---

## 9. Common Workflows

### Register a New User

```bash
# In browser, navigate to http://localhost:4200/auth/register
# Or via API:

curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@test.com",
    "password": "Password123!",
    "displayName": "Test User"
  }'

# In dev mode, verification token is returned in response
# Copy it and call:

curl -X POST http://localhost:3333/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token": "...token from above..."}'

# Get JWT token:
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "password": "Password123!"}'

# Response includes "accessToken" - use this for authenticated requests
```

### View Aladin Lite Viewer

```bash
# Navigate to http://localhost:4200/viewer?epoch=MedianStack&mode=ALADIN
# Or use browser dev tools console:

// Angular is running; you can access the store directly
// (This is debugging only; not user-facing)
```

### Create a Community Post

```bash
# First, get JWT token (see "Register a New User" above)

curl -X POST http://localhost:3333/community/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "My VLASS Discovery",
    "body": "# Interesting Object Found at RA=40.5, Dec=-75.5",
    "tags": ["VLASS2.1", "AGN"],
    "viewerSnapshot": {
      "mode": "ALADIN",
      "center": {"raDeg": 40.5, "decDeg": -75.5},
      "fovDeg": 0.5,
      "epoch": "MedianStack"
    }
  }'

# Post created but NOT published (needs moderator approval)
# See RBAC-ROLES.md for permission matrix
```

### Search an Object Name

```bash
# Via API (uses CDS Sesame)
curl 'http://localhost:3333/search/sesame?name=M87' | jq .

# Response:
# {
#   "raDeg": 187.7059,
#   "decDeg": 12.3911,
#   "objectType": "Galaxy"
# }
```

---

## 10. File Structure Overview

```text
c:\repos\vlass-portal/
├── docs/                          # Documentation (you are here!)
│   ├── OVERVIEW.md
│   ├── CODING-STANDARDS.md
│   ├── VLASS-DATASETS.md
│   ├── ARCHITECTURE.md
│   ├── RBAC-ROLES.md
│   ├── API-ROUTES.md
│   ├── SECURITY-GUARDRAILS.md
│   ├── ENVIRONMENT-CONFIG.md
│   ├── DATABASE-SCHEMA.md
│   ├── TESTING-STRATEGY.md
│   └── QUICK-START.md             # <- you are here
│
├── apps/
│   ├── vlass-web/                 # Angular 19 + SSR
│   │   ├── src/
│   │   │   ├── app/               # Modules (no standalone!)
│   │   │   │   ├── app-module.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   └── app.server.module.ts
│   │   │   ├── main.ts            # Client entry
│   │   │   ├── main.server.ts     # SSR entry
│   │   │   └── assets/            # Static files
│   │   ├── tsconfig.app.json
│   │   └── project.json           # NX project config
│   │
│   ├── vlass-api/                 # NestJS BFF
│   │   ├── src/
│   │   │   ├── app/               # Nest modules
│   │   │   │   ├── app.module.ts
│   │   │   │   ├── auth/
│   │   │   │   ├── viewer/
│   │   │   │   ├── community/
│   │   │   │   ├── audit/
│   │   │   │   └── ...
│   │   │   ├── main.ts            # NestJS entry
│   │   │   └── migrations/        # TypeORM migrations
│   │   ├── .env.local             # Dev config (you create this)
│   │   └── project.json
│   │
│   ├── vlass-api-e2e/             # API integration tests
│   │   ├── src/
│   │   │   ├── fixtures/          # Recorded API responses
│   │   │   ├── contracts/         # Nest API contracts
│   │   │   ├── audit.e2e.ts
│   │   │   └── ...
│   │   └── project.json
│   │
│   ├── vlass-web-e2e/             # Playwright browser tests
│   │   ├── src/
│   │   │   ├── fixtures/          # Golden images
│   │   │   ├── viewer.spec.ts
│   │   │   └── ...
│   │   └── project.json
│   │
│   └── vlass-rust/                # (Optional, v2+) Rust render service
│       ├── Cargo.toml
│       ├── src/
│       │   └── main.rs
│       ├── render/
│       │   ├── lib.rs
│       │   ├── preview.rs
│       │   └── snapshot.rs
│       └── tests/
│
├── libs/
│   └── shared/
│       ├── models/                # Shared DTOs (single source of truth)
│       │   ├── src/
│       │   │   ├── lib/
│       │   │   │   ├── viewer.ts
│       │   │   │   ├── auth.ts
│       │   │   │   ├── community.ts
│       │   │   │   └── audit.ts
│       │   │   └── index.ts       # Barrel export
│       │   └── tsconfig.json
│       │
│       ├── ui/                    # Angular modules (not components yet)
│       ├── server/                # Shared Nest utilities
│       └── ...
│
├── tools/
│   └── policy-tests/              # Enforcement gates
│       ├── no-standalone.spec.ts
│       ├── no-async-await.spec.ts
│       └── allowlist-enforced.spec.ts
│
├── nx.json                        # NX configuration
├── tsconfig.base.json             # Root TS config
├── tsconfig.json
├── jest.config.ts                 # Jest global config
├── jest.preset.js
├── vitest.workspace.ts            # (optional) Vitest instead of Jest
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── eslint.config.mjs
├── README.md
└── .env.example                   # Template (commit; don't commit .env)
```

---

## 11. Debugging Tips

### Browser DevTools

```javascript
// In Chrome Dev Console (vlass-web running at localhost:4200)

// Angular has been compiled away, but you can inspect the DOM
document.querySelector('[data-test-id="search-box"]').value = 'M87';

// Playwright can record interactions; useful for reproducing bugs
```

### NestJS Debugging

```bash
# Run with Node debugger
node --inspect-brk dist/apps/vlass-api/main.js

# In Chrome, go to chrome://inspect and add localhost:9229
# Breakpoints, step through, inspect variables
```

### Go Debugging

```bash
# Enable verbose logging
go run main.go -v

# Or use delve debugger
go install github.com/go-delve/delve/cmd/dlv@latest
dlv debug apps/vlass-go/main.go
```

### Database Queries

```bash
# SQLite interactive shell
sqlite3 vlass.dev.db

# PostgreSQL interactive shell
psql vlass_dev -U postgres

# Both support SQL queries directly
SELECT * FROM audit_events ORDER BY ts_utc DESC LIMIT 5;
SELECT * FROM users;
```

---

## 12. Code Generation (After Skeleton)

Once the NX workspace skeleton is created:

```bash
# Generate a new Angular component (module-based, no standalone)
pnpm nx generate @nx/angular:component \
  --name search-box \
  --project vlass-web \
  --changeDetection=OnPush \
  --standalone=false

# Generate a Nest service
pnpm nx generate @nestjs/schematics:service \
  --name viewer-state \
  --project vlass-api

# Generate a library for shared code
pnpm nx generate @nx/workspace:lib \
  --name data-access-viewer \
  --directory libs/shared
```

---

## 13. Running Specific Tests

```bash
# Run all tests in vlass-api
pnpm nx test vlass-api

# Run only AuthController tests
pnpm nx test vlass-api --testFile="**/auth.controller.spec.ts"

# Run with coverage for one file
pnpm nx test vlass-api --coverageReporters=html --testFile="**/proxy.service.spec.ts"

# Run e2e tests
pnpm nx e2e vlass-api-e2e

# Skip tests (CI only; never production)
pnpm nx build vlass-api --skip-nx-cache
```

---

## 14. Git Workflow

```bash
# Before committing, run all tests
pnpm nx run tools-policy-tests:test  # Policy gates
pnpm nx test                          # Unit tests
pnpm nx e2e vlass-api-e2e            # API contracts

# Only if all pass:
git add .
git commit -m "feat: add search-to-center workflow"
git push origin feature/search-to-center
```

---

## 15. Troubleshooting

| Issue                       | Solution                                                      |
| --------------------------- | ------------------------------------------------------------- |
| `pnpm install` fails        | Clear cache: `pnpm store prune`                               |
| Port 3333 already in use    | `lsof -i :3333` + `kill -9 <PID>`                             |
| Nest server won't start     | Check `.env.local` exists and `DB_URL` is correct             |
| Angular module not found    | Verify `tsconfig.base.json` paths include new lib             |
| Go tests fail               | Run `go mod tidy` and `go mod download`                       |
| Tests hang                  | Run `pnpm nx reset` to clear cache                            |
| "Cannot find module" in IDE | Restart VS Code language server (Cmd+Shift+P → Reload Window) |

---

## 16. Next Steps

1. **Read ARCHITECTURE.md** for system design overview
2. **Review CODING-STANDARDS.md** for naming & style rules
3. **Check API-ROUTES.md** for endpoint contracts
4. **Look at libs/shared/models** for shared DTOs
5. **Create a feature branch** and start implementing!

---

## 17. Useful Commands Cheatsheet

```bash
# Development
pnpm install                         # Install all deps
pnpm nx serve vlass-web             # Start Angular dev server
pnpm nx serve vlass-api             # Start NestJS dev server
pnpm nx test                         # Run all tests
pnpm nx lint                         # Lint all code
pnpm nx format:check                 # Check code format

# Building
pnpm nx build                        # Build all production apps
pnpm nx build vlass-api              # Build one app

# Cleanup
pnpm nx reset                        # Clear NX cache
pnpm store prune                    # Clear pnpm cache
git clean -fd                        # Remove untracked files

# Docker (if applicable)
docker-compose up                    # Start all services
docker-compose down                  # Stop all services

# Git
git log --oneline                    # View commit history
git status                           # See changed files
git diff                             # View changes
```

---

**Last Updated:** 2026-02-06

**Need Help?** See [OVERVIEW.md](OVERVIEW.md) for project mission, or check other docs in `/docs` folder.

**Ready to Code?** Start with the Angular (`vlass-web`) app. Create a new component and wire it to the store (see ARCHITECTURE.md for ViewerStateStore examples).
