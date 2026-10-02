# Testing strategy

## Layers

| Layer | Location | Runs without network |
| --- | --- | --- |
| Unit — LDAP escaping, validation, mapping, discovery logic | `src/lib/**/*.test.ts` | yes |
| Integration — full service path against an in-memory directory | `tests/integration.test.ts` | yes |
| API / route behaviour | exercised indirectly via the service layer plus live curl checks | yes |

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Why an in-memory directory

Several real defects only surfaced when talking to an actual Windows Server 2025 lab
and could not be caught by unit tests on the pure functions:

- Active Directory has **no `CN=Subschema` entry** (it is a generic LDAP construct).
  Schema definitions live on the `subSchema` children of the schema naming context as
  RFC 4512 `attributeTypes` strings. Reading `CN=Subschema` silently returned nothing.
- `DC=DomainDnsZones` / `DC=ForestDnsZones` are pure `DC=` chains and were misclassified
  as domain naming contexts.
- Reading a deleted DN answers with DSID text `problem 2001 (NO_OBJECT)`, not an empty result.
- Rights failures arrive as `problem 4003 (INSUFF_ACCESS_RIGHTS)`.

`tests/fake-directory.ts` reproduces all of these, so the same class of bug fails fast in
CI. The fake is a test double, not a directory server: it implements only what this
application calls, and it deliberately returns AD-shaped error strings.

## Test seam

`LDAPClient` resolves its transport through `setTransportFactory()`. Production uses
`ldapts` over `ldaps://` with system trust-store validation; tests inject
`FakeDirectory`. The seam is intentionally narrow — it does not bypass profile
validation, escaping, or capability logic, so those stay covered.

## Escape-hatch test

`tests/filter-fidelity.test.ts` pins the fake's RFC 4515 subset (`&`, `|`, `!`,
substring matching, presence checks) to the filters this application actually builds.
A misleading double is worse than no double, so its fidelity is itself tested.

## Live verification

`npm test` must never require credentials or a live domain. Behaviour that can only be
proven against a real server was verified manually against a lab DC and the findings are
captured above and in the `FakeDirectory` defaults. Any future live check should use a
throwaway bind identity; never commit real credentials, and never point CI at a lab.

## Not covered yet

- No browser/UI test runner; UI interactions are verified manually.
- No load or concurrency testing for large directories (search size limits are 1-200).
- Capability flags describe discovery visibility, not a live write-rights probe.
