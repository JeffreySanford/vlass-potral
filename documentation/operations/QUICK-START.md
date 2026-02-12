# Quick Start

Status date: 2026-02-07

## Prerequisites

- Node.js 20+

- pnpm 9+

## Install

```bash
pnpm install

```text

## Run

Recommended (infra + app):

```bash
pnpm start:all

```text

Split mode (two terminals, no infra automation):

Terminal 1:

```bash
pnpm start:web

```text

Terminal 2:

```bash
pnpm start:api

```text

## Test

```bash
pnpm test
pnpm test:web
pnpm test:api

```text

## Build

```bash
pnpm build

```text

## Notes

- Nx is the primary task runner.

- `pnpm` scripts are wrappers around Nx targets.

- `start:all` runs:

  1. `start:ports:free`

  2. `start:infra` (`docker compose down --volumes`, build, up `--wait`)

  3. `pnpm nx run-many --target=serve --projects=cosmic-horizons-web,cosmic-horizons-api`

## - Go and Mode B are deferred and not part of MVP setup
---

*Cosmic Horizon Development - (c) 2026 Jeffrey Sanford. All rights reserved.*

---
*Independent portal using public VLASS data; not affiliated with VLA/NRAO.*
