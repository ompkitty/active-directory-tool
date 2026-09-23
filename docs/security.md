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

## Open hardening

Web-panel authentication does not exist yet — the app is development-only (issue #7).
Audit UI, persisted encrypted secrets, and session/CSRF protections follow in issues #7/#8.
