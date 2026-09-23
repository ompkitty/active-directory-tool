# Active Directory Tool

Development-only web panel for authorized Active Directory administration over **LDAPS**.

## Status

Early vertical slices (issues #1-#4). The app manages multiple LDAPS connection
profiles, tests them server-side with staged diagnostics, displays per-profile RootDSE
discovery, and searches users scoped to the active profile. Mutations (#6), web
authentication (#7), and audit UI (#8) are open issues and intentionally not implemented yet.

**Authentication:** the web panel has no login yet and the administrative surface must be
treated as development-only. Web authentication is tracked in issue #7 and is separate from
binding to Active Directory.

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
→ `ldapts` client. See `docs/architecture.md`, `docs/security.md`, and `docs/decisions/`.

## Configuration

Copy `.env.example` for infrastructure secrets only. Directory targets are runtime
connection profiles created in the UI — never environment variables or hard-coded values.

```bash
cp .env.example .env.local
```
