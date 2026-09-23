# 0002 — LDAP client: ldapts over ldapjs

Date: 2026-09-23. Status: accepted.

Checked 2026-09-23 via `npm view`: `ldapjs@3.0.7` last modified 2024-05-14 (stale,
historically unmaintained); `ldapts@9.2.0` last modified 2026-09-15 (actively maintained,
LDAP client with Promise API and TLS options).

Decision: use `ldapts` for all server-side LDAP communication. `ldapjs` was removed from
dependencies. No duplicate LDAP libraries.
