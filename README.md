# Active Directory Tool

Development-only web panel for authorized Active Directory administration over **LDAPS**.

## Status

Implemented: multi-profile LDAPS connections with staged diagnostics, per-directory
discovery (RootDSE, domain/forest/schema, capabilities), user search and detail, and the
mutation set (create, attribute edit/add, enable/disable, move, delete, password reset).
Integration tests run against an in-memory directory double — see `docs/testing.md`.

**Authentication:** there is no web login by design. The operator authenticates by binding
to Active Directory, so there is no second credential store or session. The consequence is
that the surface is development-only and must not be exposed to untrusted networks.

## Theme

Light and dark are both supported. The console follows your OS preference on first
visit; the toggle in the sidebar persists your choice. Theme colors live as semantic
tokens in `src/app/globals.css` — components reference tokens, not palette colors, so
adding a theme means editing that one file.

## Setup

```bash
npm install
npm run dev
```

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Architecture

`app/` (UI) → `app/api/` (validation, error mapping) → `lib/ldap/` (connection, discovery)
→ `ldapts` client. See `docs/architecture.md`, `docs/security.md`, `docs/testing.md`, and
`docs/decisions/`.

## Configuration

Copy `.env.example` for infrastructure secrets only. Directory targets are runtime
connection profiles created in the UI — never environment variables or hard-coded values.

```bash
cp .env.example .env.local
```
