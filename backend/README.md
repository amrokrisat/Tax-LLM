# Backend

FastAPI service with modular layers for transactional tax analysis.

## Structure
- `src/tax_llm/domain`: core models
- `src/tax_llm/application`: orchestration use cases
- `src/tax_llm/infrastructure`: fixtures, parsing, retrieval adapters
- `src/tax_llm/interfaces/api`: HTTP layer
- `data/seed`: demo data for the scaffold
- `tests/`: API and service tests
