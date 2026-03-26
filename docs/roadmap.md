# Tax LLM Roadmap

## Version 1
- authenticated matter workspace
- saved matters and analysis runs
- retrieval-first issue spotting and authority review
- structural alternatives and memo drafting
- Google sign-in and deployed frontend/backend

## Version 2

### Build order
1. Replace JSON storage with a real database layer and migration path.
2. Add document extraction plus extracted-facts confirmation in the matter workspace.
3. Add reviewer notes, reviewed state, and pinned authorities on saved runs.
4. Add exportable memo/report output.
5. Deepen one substantive wedge enough to materially improve quality in a live demo.

### Current V2 implementation start
- SQLite-backed persistence replaces the flat JSON stores while preserving the current API shape.
- Legacy JSON auth and matter data migrate forward automatically on first access.
- Document extraction scaffolding now stores extracted text and fact candidates for confirmation.
- Runs now support review status, reviewer notes, and pinned authority ids.
- Memo export is available as markdown from a saved run.

### Highest-value wedge for V2
- Reorganization + rollover + stock-vs-asset + attribute preservation

Why this wedge first:
- it already matches the strongest current corpus
- it drives the most visible structural comparison value
- it compounds with extraction, review, and export better than a thinner overlay category

### Highest-risk migration points
- preserving existing local/demo JSON matter data while moving to database-backed storage
- keeping auth/session behavior stable across local and deployed environments
- expanding uploaded-document records without breaking current run history payloads
- avoiding UI drift while reviewer and extraction states are added incrementally

### Out of scope for V2
- full OCR and production-grade PDF extraction
- team/org permissions and collaborative editing
- final polished report templating for multiple opinion styles
- production-scale vector retrieval stack replacement
- state-by-state or international depth expansion beyond first-pass issue spotting

## Version 3
- production database hosting and admin tooling
- richer extraction workflows with OCR/chunk lineage
- collaborative reviewer workflow and audit trail
- export packages and polished client-ready reports
- deeper jurisdictional and entity overlays
