# Tax LLM

Tax LLM is a transactional tax agent for planning, structuring, and deal analysis.

Version 1 is scoped to:
- intake transaction facts
- parse uploaded deal documents
- retrieve tax authorities
- identify tax issues
- compare structural alternatives
- draft memo-style output with citations
- generate missing-facts questions

## Repository Structure
- `frontend/`: Next.js application for intake, review, and memo preview
- `backend/`: Python API and modular orchestration layer
- `docs/`: architecture and design documents
- `evals/`: transactional tax hypos, benchmarks, and scoring references
- `AGENTS.md`: contributor and coding-agent guidance

## Proposed Architecture
The scaffold uses a clean modular architecture.

- `frontend/`
  - App Router UI
  - feature-oriented components
  - demo workspace wired to seeded analysis output
- `backend/`
  - `domain/`: transaction facts, issues, alternatives, authorities, memo models
  - `application/`: intake, retrieval, issue spotting, comparison, drafting orchestration
  - `infrastructure/`: demo authority repository, document parser, fixture loaders
  - `interfaces/api/`: FastAPI routes and request/response schemas
- `evals/`
  - sample tax hypos
  - benchmark expectations
  - rubric for issue coverage, authority quality, and memo usefulness

More detail lives in [docs/architecture.md](/Users/amroalkrisat/Documents/Tax%20LLM/docs/architecture.md).

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn tax_llm.interfaces.api.main:app --reload
```

API default: `http://127.0.0.1:8000`

Run backend tests with:

```bash
cd backend
source .venv/bin/activate
pytest tests -q
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend default: `http://127.0.0.1:3000`

Frontend notes:
- use Node.js `20.9+` for Next.js 16
- the frontend is pinned to stable compatible versions of `next`, `react`, and `react-dom`
- linting uses the ESLint CLI via `npm run lint`

## What’s Included In This Scaffold
- seeded transaction scenario and corpus-backed authority examples
- FastAPI endpoints for health, demo scenario loading, and live retrieval-first analysis
- Next.js dashboard with an editable intake form and backend-driven analysis review
- architecture docs and roadmap notes
- eval fixtures for benchmark-driven development

## Initial API Surface
- `GET /health`
- `GET /api/v1/demo/scenario`
- `POST /api/v1/intake/analyze`

The analysis endpoint currently uses a deterministic retrieval-first workflow over the local authority corpus so the repo is demoable before larger-scale research and LLM layers are added.

The current MVP is retrieval-first: the backend classifies issue buckets, loads tagged authority records from the local corpus, validates coverage before drafting, and flags under-supported conclusions.

Backend data files are loaded relative to the backend project root via shared path helpers, so local runs and tests resolve fixture and authority files from `backend/data/...` consistently.

## Authority Corpus
Place authority files under:
- `backend/data/corpus/code/`
- `backend/data/corpus/regs/`
- `backend/data/corpus/irs_guidance/`
- `backend/data/corpus/cases/`
- `backend/data/corpus/forms/`
- `backend/data/corpus/internal/`

Supported formats:
- `.txt`
- `.md`
- `.json`
- `.pdf` is scaffolded as a pending ingestion format and is reported as a corpus gap until parsing is implemented

For `.txt` and `.md`, include front matter like:

```md
---
title: Reorganization provisions
citation: IRC Sections 354, 356, 361, 368
issue_buckets: [merger_reorganization, rollover_equity]
jurisdiction: United States
effective_date: 2025-01-01
tax_year: 2025
authority_weight: 1.0
tags: [merger, reorganization, rollover]
---
Authority text here.
```

For `.json`, provide either a single object or an `authorities` array with the same metadata fields plus `body` or `excerpt`.

## Ingestion And Retrieval
- Ingestion runs lazily when the authority repository first builds its in-memory index.
- The loader walks each corpus folder, parses supported files, stores structured authority records, and tracks pending PDF files.
- Retrieval supports filters for issue bucket, transaction type, source type, title keywords, citation keywords, jurisdiction, and effective-date range.
- Ranking favors this source priority: Code, Regulations, IRS guidance, Cases, Forms, Internal.
- Analysis warns when a bucket is supported only by internal or otherwise non-primary material.

## Current Corpus Gaps
- PDF extraction is not implemented yet
- There is no vector or hybrid semantic search yet
- Deduplication, citation normalization, and corpus versioning still need hardening
- The corpus now has a practical first-pass corporate transaction pack for reorganizations, Section 338, Section 382, Section 1060, Section 351/721, and financing overlays, but it is still thin on consolidated return rules, international subpart/FDII/GILTI issues, state-specific authorities, withholding statutes, debt-equity authorities, earnout case law, and bankruptcy/distressed M&A materials

## Development Notes
- Treat generated conclusions as draft analytical support, not legal advice.
- Keep citations attached to memo output.
- Update `/evals` when changing issue spotting or memo drafting behavior.
