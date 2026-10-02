# Security baseline

- LDAPS only (`ldaps://`, default port 636). No Plain LDAP, no StartTLS, no protocol selector.
- System trust store by default; private enterprise CAs via `NODE_EXTRA_CA_CERTS`.
- Certificate-validation bypass exists only as an explicitly labeled lab-only option and is never default.
- LDAP communication happens server-side only (`lib/ldap/`, API routes). The browser never connects to AD.
- Bind passwords travel per request, stay in server memory, and are never persisted (localStorage holds
  non-secret profile fields only), logged, returned to the client, or placed in URLs.
- LDAP filters escaped per RFC 4515 (`escapeLDAPFilter`); DN values escaped per RFC 4514 (`escapeDN`).
- API errors are short, actionable, and redacted; raw LDAP internals never reach the UI.
- Diagnostics distinguish Network / TLS handshake / Certificate validation / LDAP / RootDSE / Bind / Discovery.
- Audit events (`lib/audit.ts`) record profile-scoped actions without secrets.
- `.env*` secret files are git-ignored; `.env.example` contains placeholders only.

## Authentication model

There is no web login. The operator authenticates by binding to Active Directory with a
bind identity, so there is no second credential store, no session, and no login-form
CSRF surface. Consequences that are accepted, not overlooked:

- The panel is development-only and must not be exposed to untrusted networks.
- Anyone with browser access can act with the privileges of whichever bind identity is
  entered. Prefer a least-privilege AD account.
- Bind secrets stay memory-only per request: never persisted, logged, or returned.

## Open hardening

- Audit events are written server-side only; there is no audit UI yet.
- Connection profiles are stored in `localStorage` (non-secret fields only). Encrypted
  server-side secret storage is not implemented.
- No rate limiting or lockout protection on the connection-test endpoint.
