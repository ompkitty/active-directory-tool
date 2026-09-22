# Security Baseline

- LDAPS only, certificate validation default
- Server-side LDAP only
- Secrets encrypted at rest
- No credentials in logs/URL
- LDAP filters escaped
- TLS errors distinct from LDAP errors
- Web auth separate from AD bind

Development-only web authentication. Production hardening required.
