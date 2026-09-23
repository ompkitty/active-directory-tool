# Architecture

## Layers

```text
Web UI (app/, components/)
  -> Server/API (app/api/test-connection/route.ts: validation, error mapping, audit)
      -> AD service (lib/ldap/service.ts: validation, orchestration)
          -> LDAP client (lib/ldap/client.ts: ldapts, LDAPS-only)
```

Supporting modules: `lib/ldap/escape.ts` (RFC 4514/4515 escaping, profile validation),
`lib/ldap/users.ts` (user filter builder, entry normalization preserving custom attributes),
`lib/profiles.ts` (client-side non-secret profile store, per-profile discovery cache),
`lib/audit.ts` (structured server-side audit events without secrets).

## Connection profile model

```text
ConnectionProfile
├── id, displayName
├── endpoint (host/port, always ldaps://; default 636)
├── bind identity + per-request secret (never persisted)
├── optional baseDN override
├── TLS settings (validation required; lab-only bypass explicit)
├── timeouts
└── per-profile discovered metadata + capabilities
```

Every directory query carries the active profile context. Discovery caches, audit records,
and user state are partitioned by profile id. Switching profiles changes the active banner
and the discovery shown; no DNs, GUIDs, SIDs, or schema data are reused across profiles.

## Discovery-first

After bind, the service reads RootDSE (`defaultNamingContext`, `namingContexts`,
`dnsHostName`, functionality levels, schema context) and derives the effective base DN
(override or discovered default). Missing permissions degrade gracefully: the affected
stage reports unavailable instead of failing silently.

## LDAP client decision

`ldapts` (actively maintained) is used instead of `ldapjs` (stale since 2024-05).
See `docs/decisions/0002-ldap-client-ldapts.md`.

## User search flow

```text
Users page (query + per-session password)
  -> POST /api/users (validation, limit 1-200, audit)
      -> LDAPService.searchUsers
          -> bind -> RootDSE (effective base DN) -> subtree user search
          -> normalizeUser: friendly fields + additionalAttributes
```

The search base is always resolved server-side (profile override or discovered default
naming context); the client never supplies a DN. Filters are built from fixed templates
with RFC 4515 escaping. Results are cached per profile id in the UI and never shared
across profiles.

## User detail flow

The detail dialog renders from the cached search result — no extra LDAP round trip.
`splitUserAttributes` groups identity, account state, normalized, and additional
(discovered) attributes; fields the directory did not return are shown as unavailable
rather than hidden, so varying schemas stay visible. The dialog header always shows the
source profile and search base.

## Mutation flow (single-attribute replace)

```text
Detail dialog (edit -> review -> confirm)
  -> POST /api/users/attributes (validation, protected-attribute blocklist, audit)
      -> LDAPService.replaceUserAttribute
          -> modify replace -> verify by re-reading the attribute
      -> UI cache updated with verified values via applyAttributeEdit
```

Edits are limited to non-protected attributes (see `isProtectedAttribute`); DN identity,
system/constructed attributes, and special-semantics attributes (userAccountControl,
pwdLastSet, lockoutTime) are read-only in the generic editor and need dedicated,
separately reviewed operations. Every mutation requires an explicit in-UI confirmation
and is audited per profile without logging values.

## Account enable/disable flow

Dedicated `setAccountEnabled` operation: reads current userAccountControl from the
server, flips only the ACCOUNTDISABLE bit (preserving all other flags), writes it back,
and verifies by re-reading. No-op when already in the desired state. UI offers an
explicit confirm step with destructive styling for disable; the dialog and table update
from the verified result.
## User creation flow

`createUser`: validates input, builds an escaped DN, adds the entry disabled (UAC 546),
sets the initial password via unicodePwd (quoted UTF-16LE over LDAPS), then enables
(UAC 512) unless disabled was requested. Later-step failures return the created DN with
a warning for manual follow-up — nothing is retried automatically, and the entry is
never left half-configured silently.

## Container listing for user creation

`listContainers`: subtree search for `organizationalUnit`/`container` objects,
normalized to `{dn, name}` (ou/cn/name with RDN fallback). Groups are excluded —
AD users cannot be created under groups. The create dialog offers the list as a
dropdown with manual-DN fallback when the listing is unavailable; results are cached
per profile.
