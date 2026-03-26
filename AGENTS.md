# AGENTS.md

## Mission
Tax LLM is a transactional tax agent for planning, structuring, and deal analysis. The product should help users intake transaction facts, parse deal documents, retrieve tax authorities, identify tax issues, compare structural alternatives, draft memo-style analysis with citations, and generate missing-facts questions.

## Working Principles
- Prefer modular, auditable systems over opaque end-to-end flows.
- Treat tax conclusions as provisional unless tied to retrieved authorities and explicit assumptions.
- Keep facts, issues, alternatives, authorities, and conclusions as separate artifacts.
- Preserve traceability from user input to retrieved source to drafted output.
- Optimize for human review by tax professionals.

## Architecture Guardrails
- Frontend: `Next.js` with App Router and TypeScript.
- Backend: Python with a layered architecture:
  - `domain/` for core entities and invariants
  - `application/` for orchestration use cases
  - `infrastructure/` for retrieval, storage, parsing adapters
  - `interfaces/` for API endpoints and DTOs
- Evals live in `/evals` and should be updated alongside behavior changes.
- Demo fixtures live in `/backend/data` and `/frontend/lib`.

## Coding Expectations
- Prefer small, composable modules with explicit interfaces.
- Keep business logic out of transport layers.
- Add types everywhere practical.
- Make seeded demo flows deterministic so the scaffold is easy to demo and test.
- Avoid overstating legal certainty in generated content.

## Output Safety
- Always separate:
  - facts provided
  - assumptions made
  - authorities retrieved
  - issues identified
  - alternatives compared
  - open questions
- Memo-style output must include citations or explicit placeholders where citations are missing.
- Missing-facts questions should be specific enough for deal teams to answer.

## Repository Map
- `frontend/`: Next.js UI for intake, analysis review, and memo preview
- `backend/`: Python API and orchestration logic
- `docs/`: architecture, roadmap, and design notes
- `evals/`: tax hypos, benchmark cases, and scoring guidance

## Suggested Next Build Steps
1. Replace seeded retrieval with a real authority retrieval pipeline.
2. Add document upload, chunking, and metadata extraction.
3. Add user/project persistence.
4. Add eval runners and regression gates in CI.
5. Add citation-grounded memo drafting with review workflows.
