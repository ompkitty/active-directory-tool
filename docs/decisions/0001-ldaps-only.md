# 0001 — LDAPS-only transport

Date: 2026-09-23. Status: accepted.

LDAPS (`ldaps://<host>:636`) is the sole supported transport. Plain LDAP and StartTLS are
out of scope: no implementation, no UI selector, no validation branches, no dead code.

Rationale: simplifies the MVP, keeps certificate validation mandatory by default, and matches
the acceptance test (Windows Server 2025 lab with valid LDAPS certificate at
`ldaps://dc01.lab1.local:636` working without disabling validation when the CA is trusted).

Consequences:

- FQDN endpoints preferred for hostname validation.
- System trust store default; `NODE_EXTRA_CA_CERTS` for enterprise CAs.
- Lab-only bypass explicitly labeled unsafe, never default.
- Diagnostics split: Network, TLS handshake, Certificate validation, LDAP, RootDSE, Bind, Discovery.
