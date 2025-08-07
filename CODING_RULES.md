# Coding Rules (Team Readme)

**Goal:** Produce readable, testable, extensible Node.js code.

## Layers

    src/
      core/            # ports (I*), entities, use-cases (pure TS/JS)
      infrastructure/  # adapters: http/scraper, whatsapp, store, db, queue
      interfaces/      # express/http api, cli
      config/          # env loading & validation
      app.ts|js        # composition root (wire dependencies; `new` lives here)
      index.ts|js      # process entry

- `core`: framework-agnostic business logic and interfaces.
- `infrastructure`: implementations of ports using third-party libs.
- `interfaces`: I/O edges only (HTTP/CLI).
- `app`: dependency wiring; no business logic.
- `index`: entrypoint.

## SOLID
- **SRP**: one responsibility per class/file.
- **OCP**: add new behavior via new classes/adapters, not edits everywhere.
- **LSP/ISP**: small, focused ports; implementations obey contracts.
- **DIP**: high-level depends on interfaces; no third-party in domain code.

## Style
- Node 18+, ESM (`"type": "module"`), `async/await`.
- Naming: PascalCase (class/interface), camelCase (fn/var), UPPER_SNAKE_CASE (const), kebab-case filenames.
- Functions ~≤40 lines, files ~≤400 lines.
- Public API functions must have **JSDoc**; comment complex logic.
- Structured logging with **pino**; never log secrets.

## Security & Config
- Use `.env`; never hardcode credentials.
- Validate inputs/config with a schema (zod/valibot).
- External HTTP: timeout + retry (backoff) + optional circuit breaker.
- Enforce file/media type and size limits.

## Testing & Quality
- **Unit tests** for use-cases; **integration tests** for critical paths.
- Lint/format/tests must pass before merging; target ≥ 80% coverage.
- Mock ports for fast, side-effect-free unit tests.

## Git & PR
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- PR description includes Why/What/How, risks, and test plan.
- Prefer small, focused PRs over large ones.

## Avoid
- Widespread `any`, global mutable state, domain-layer third-party usage.
- Empty `catch`, excessively long methods/files.
