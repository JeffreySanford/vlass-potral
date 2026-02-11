# Cosmic Horizons 2026 Submission Playbook

Status date: 2026-02-11  
Audience: Jeffrey Sanford (independent developer)  
Purpose: Turn strategic conference information into a concrete submission and presentation workflow.

---

## Core Timeline

- Abstract deadline target: April 1, 2026 (verify on official conference page before submission).
- Conference window: July 13-16, 2026 (verify final published schedule/venue details).
- Recommended internal lock:
  - T-4 weeks: abstract final draft + citation table.
  - T-3 weeks: poster layout freeze.
  - T-2 weeks: live demo script freeze.
  - T-1 week: dry-run with fallback demo recordings.

Use official event channels (CosmicAI/NRAO/Whova pages) as the source of truth for logistics.

---

## Submission Workflow

1. Confirm official conference page details (deadline, format, links, fee rules).
2. Register and submit through Whova (or official replacement platform).
3. Submit one primary abstract and one backup-short version.
4. Store final submitted text and timestamp in this repo under `documentation/marketing/abstracts/`.
5. Track outreach follow-up in `documentation/marketing/letters/`.

---

## Strategic Framing for Abstract

Position Cosmic Horizon as:

- Independent, public-data-compatible, integration-ready platform.
- "Front-half" UX and operations layer that complements institutional compute/model backends.
- Human-in-the-loop system for usability, auditability, and explainability.

Avoid implying:

- official institutional ownership,
- endorsement,
- partnership already established.

Required phrase pattern:

"Independent portal using public VLASS-related workflows; not affiliated with or operated by VLA/NRAO/VLASS."

---

## How to Frame the "Human Bottleneck"

Use this structure:

1. Phase change:
   Data scale and pipeline complexity exceed local/manual workflows.
2. Operational gap:
   Compute and models exist, but usable researcher-facing orchestration is underdeveloped.
3. Platform answer:
   Cosmic Horizon provides fast web access, persistent visualization context, and revision-tracked collaboration.
4. Value:
   Enables trustable, reviewable AI-assisted workflows instead of opaque batch outputs.

Keep external quantitative claims source-dated and cited.

---

## Poster Demo Focus

Poster should show implementation and near-term integration readiness:

1. What is already shipped:
   - SSR-first experience.
   - Viewer persistence (permalink/snapshot).
   - Notebook + revision collaboration.
2. Quality gates proving operational maturity:
   - lint/test/e2e, docs consistency checks.
3. Next integration contracts:
   - `submit`, `status`, `cancel` style remote job interface.
4. Governance and trust:
   - affiliation-safe positioning,
   - policy-aware expansion boundaries,
   - audit/reproducibility design.

Live demo recommendation:

- 3-minute path: landing -> viewer state share -> notebook revision -> profile/collaboration surface.
- Always carry a pre-recorded fallback in case of network issues.

---

## One-Page Pitch Structure (NRAO/CosmicAI Outreach)

1. Problem:
   Human bottleneck under large-scale AI-enabled astronomy operations.
2. Current proof:
   Implemented pillars + quality gates in working codebase.
3. Interface thesis:
   Platform as operations/control-plane UX, not replacement of science backends.
4. Integration ask:
   Technical discovery meeting on interface contracts and policy boundaries.
5. Compliance:
   Explicit independence and non-affiliation statement.

---

## Explaining "How the Platform Handles the Data Firehose"

Use capability language, not overclaims:

- Web-native SSR and optimized first paint reduce interaction latency.
- Persistent viewer state/snapshot mechanics support collaboration without moving massive raw datasets.
- Notebook and revision history create transparent, reproducible workflow context.
- Architecture is positioned to orchestrate remote compute workflows rather than local raw-data handling.

Do not claim direct ownership/control of institutional archives or compute unless formally integrated.

---

## Pre-Submission Checklist

- [ ] Abstract text aligned with conference themes (Explorable/Observable/Explainable/Accelerated).
- [ ] Affiliation disclaimer included.
- [ ] External numeric claims cited with date/source.
- [ ] Demo plan includes offline fallback.
- [ ] One-page outreach brief prepared.
- [ ] Contact and follow-up templates personalized.

---

## Related Docs

- `documentation/marketing/abstracts/COSMIC-HORIZONS-2026-ABSTRACT.md`
- `documentation/marketing/scope/COSMIC-HORIZONS-2026-SCOPE.md`
- `documentation/marketing/EXECUTIVE-PITCH-NGVLA-HUMAN-BOTTLENECK-2026-02-11.md`
- `documentation/product/AFFILIATION.md`
- `documentation/governance/EXTERNAL-RESEARCH-WORKFLOW.md`

---

*Cosmic Horizon Development - (c) 2026 Jeffrey Sanford. All rights reserved.*
