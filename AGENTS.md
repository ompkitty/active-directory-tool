# AGENTS.md — ActiveDirectory Tool

## 1. Project mission

This repository contains a small, maintainable web-based administration tool for Microsoft Active Directory.

The application shall:

- connect to **any authorized Active Directory environment at runtime** via **LDAPS** using a configurable server hostname/IP and bind identity,
- support **multiple independent directory connection profiles** rather than a single fixed AD server,
- automatically discover relevant directory metadata and existing users/attributes **per connected directory**,
- provide a web dashboard/panel for user administration,
- make directory administration easier without hiding or weakening the underlying AD behavior,
- use a clean monochrome visual design based on shadcn/ui.

The project is intended for authorized administration of AD environments. Build for correctness, auditability, least privilege, and safe failure.

## 2. Default technical direction

Unless the repository already establishes a different stack, use:

- Next.js with App Router
- TypeScript with strict type checking
- Tailwind CSS
- shadcn/ui and its installed skill
- Node.js server-side code for LDAP communication
- a current, actively maintained LDAP client library selected after checking current package health/documentation
- LDAPS is the **only supported directory transport**; Plain LDAP and StartTLS are out of scope

Do not introduce a second frontend framework or a second UI component system.

The application must remain portable across different AD environments. Never bake one domain, forest, IP address, hostname, base DN, schema, or administrator account into application code.

LDAP communication must happen server-side. Never make direct LDAP connections from browser code.

## 3. Repository and GitHub workflow

GitHub is the project-management source of truth for work items. Git is the source of truth for code and documentation.

### Issues

Every non-trivial task must have a GitHub Issue before implementation.

Issues should contain:

- goal,
- relevant context,
- explicit acceptance criteria,
- non-goals where useful,
- dependencies/blockers,
- security implications when applicable.

Use `gh` for GitHub operations. Prefer commands such as:

```bash
gh issue list
gh issue view <number>
gh issue create
gh issue comment <number>
gh pr create
gh pr view <number>
```

### Branches

Never work directly on `main`.

Use one branch per logical task, for example:

```text
feature/issue-12-ldap-connection
fix/issue-27-user-search
chore/issue-5-project-scaffold
```

### Commits

Keep commits small and logically coherent. Commit messages should describe the actual change.

Do not mix unrelated refactors, formatting-only changes, dependency upgrades, and feature work in the same commit.

### Pull requests

A completed issue should normally result in a pull request unless the change is explicitly a local-only setup step.

A PR should include:

- what changed,
- why,
- tests/checks run,
- known limitations,
- security-sensitive behavior,
- reference to the GitHub Issue.

Never merge a PR automatically unless explicitly instructed to do so.

## 4. Agent working protocol

At the start of every task:

1. Read this `AGENTS.md`.
2. Inspect the repository state.
3. Read the relevant GitHub Issue.
4. Inspect related code/docs before editing.
5. State a concise implementation plan internally before making changes.
6. Make the smallest change that satisfies the acceptance criteria.
7. Run the relevant tests, type checks, linting, and build checks.
8. Review the final diff for accidental changes and secrets.
9. Update documentation when behavior or setup changes.
10. Report remaining uncertainty instead of inventing facts.

Do not rewrite working code merely to match personal style.

Do not close an Issue merely because code was written. The acceptance criteria must be satisfied.

## 5. Architecture principles

Prefer a simple layered architecture:

```text
Web UI
  -> Server/API layer
      -> AD service layer
          -> LDAP client
```

Keep these responsibilities separate:

- UI components: presentation and user interaction.
- Server/API: request validation, authorization, session handling, error mapping.
- AD/LDAP service: connection lifecycle, discovery, searches, mutations.
- Domain/types: normalized application types independent of UI.
- Audit/logging: structured operational events without secrets.

Avoid putting LDAP logic directly into React components or route handlers when it can live in a service module.

Do not leak raw LDAP connection objects, credentials, or protocol-specific details into the client.

## 6. LDAP / Active Directory behavior

### Connection

The application must support **runtime-created connection profiles**. A profile represents one target directory and may be created, edited, tested, selected, and removed without rebuilding or redeploying the application.

A connection profile should support, where practical:

- display name/label,
- hostname or IP address,
- LDAPS,
- configurable port with `636` as the default,
- secure TLS validation,
- bind username / UPN / supported bind identity format,
- bind password handled only by the server-side secret mechanism,
- optional base DN override when automatic discovery cannot determine it,
- connection timeout,
- configurable search timeout where supported.

Do **not** rely on a single global `AD_HOST`, `AD_PORT`, or `AD_BIND_USER` runtime configuration as the application's primary connection model. Environment variables may be used only for application infrastructure/secrets, such as an encryption key or local development bootstrap, and must not define the only directory target.

Each request that touches the directory must be explicitly associated with a selected connection profile/session. Never accidentally reuse credentials, cached discovery metadata, object identifiers, or schema information from another directory.

LDAPS is mandatory. Do not support or expose Plain LDAP or StartTLS. Do not silently disable certificate validation.

For development or troubleshooting, any explicit TLS-verification override must be visibly marked as unsafe, require deliberate configuration, and never be the production default.

### Connection profile isolation

The data model should treat every target directory as an independent tenant-like context, even when the application is used by a single administrator. At minimum keep separate:

- endpoint configuration,
- credentials/secrets,
- discovered RootDSE metadata,
- naming contexts and base DNs,
- discovered attribute/schema metadata,
- caches,
- active user/object context,
- audit records identifying the target profile.

A connection profile must never assume that a DN, object GUID, SID, attribute, schema extension, or domain name discovered on another profile is valid for the current profile.

TLS/certificate validation settings and diagnostics are also profile-scoped.

If profile persistence is implemented, store secrets through an appropriate server-side secret/encryption mechanism. Do not persist passwords in plaintext in JSON files, browser storage, localStorage, cookies, URLs, Git, or ordinary database columns without a documented protection mechanism.

### Discovery-first behavior

After connecting to a profile, prefer discovery over fixed configuration. The UI and service layer should derive capabilities from the connected directory where possible. A server may expose different naming contexts, attributes, optional schema extensions, permissions, or supported operations. The application should therefore hide/disable unavailable functionality based on verified capability information rather than assuming every target has identical capabilities.

### Discovery

On a successful connection, discover directory information automatically where the server permits it, including as applicable:

- RootDSE information,
- default naming context,
- naming contexts,
- DNS/forest/domain information available through LDAP,
- schema reference information,
- available user/object attributes relevant to the UI.

Do not assume a hard-coded domain, base DN, or attribute set when AD can provide the information dynamically.

Discovery should degrade gracefully when permissions or server capabilities prevent a particular query.

### User discovery

The UI should be capable of:

- listing users,
- searching/filtering users,
- opening a user detail view,
- showing discovered attributes,
- distinguishing readable attributes from unavailable/empty attributes,
- clearly showing which connection profile / directory the current data belongs to.

Common AD attributes may be normalized into friendly fields, but unknown/custom attributes must not be discarded merely because they are not in the initial mapping.

The implementation must not assume that all directories expose the same user object shape. Attribute mappings, optional fields, schema extensions, and writable properties must remain discoverable/configurable per connection profile.

Prefer a model such as:

```text
User
├── identity fields
├── account state
├── common normalized attributes
└── additional attributes[]
```

Do not require a fixed schema for every AD installation.

### User management

Implement mutations incrementally and safely. Potential operations include:

- create user,
- update attributes,
- enable/disable account,
- move user when supported,
- delete user only with explicit confirmation,
- password reset only as a deliberate, separately reviewed capability.

High-impact operations must have:

- explicit UI confirmation,
- server-side validation,
- clear error handling,
- audit logging,
- no accidental retries that could repeat the mutation.

Do not implement destructive functionality merely because it is possible through LDAP. Add it only when covered by an Issue and acceptance criteria.

## 7. Security requirements

Security is a first-class requirement because the application handles directory administration.

Never:

- commit passwords, tokens, private keys, certificates containing private material, or real directory credentials,
- log bind passwords,
- expose LDAP credentials to browser JavaScript,
- place secrets in URLs, query strings, client-visible error messages, or generated source code,
- weaken TLS certificate validation by default,
- trust arbitrary user-provided LDAP filters without correct escaping,
- construct LDAP DNs or filters by unsafe string concatenation where proper escaping APIs are available,
- return raw low-level exceptions that may disclose credentials or internal topology.

Use environment variables or an appropriate server-side secret mechanism for development/runtime secrets. Keep example configuration free of real values.

Use least-privilege AD accounts for normal administration and separate high-risk operations when the deployment model allows it.

Validate and constrain all user-supplied values at the server boundary.

Use CSRF/session protections appropriate to the chosen authentication architecture.

Do not invent an authentication/authorization model for the web panel without documenting it. The app must clearly distinguish:

1. authenticating to the web panel, and
2. binding to Active Directory.

If web authentication is not implemented yet, mark the application as development-only rather than pretending the administrative surface is production-ready.

## 8. Error handling

Errors presented to users should be concise and actionable.

Internally preserve enough structured detail for diagnosis, but redact secrets and unnecessary sensitive directory data.

Handle common LDAP conditions deliberately, including:

- invalid credentials,
- server unavailable,
- timeout,
- TLS/certificate failure,
- insufficient access rights,
- object not found,
- constraint violations,
- duplicate/conflicting attributes.

Do not turn an LDAP failure into a generic successful-looking UI state.

## 9. UI / UX requirements

The interface is a dashboard/web-panel and should feel like an administration console rather than a marketing site.

Use shadcn/ui as the primary component system. The official shadcn/ui model favors composable, open component code that lives in the project and can be customized; use that approach rather than introducing another UI framework. See the official documentation when needed: https://ui.shadcn.com/docs

Visual direction:

- monochrome,
- clean,
- compact but readable,
- professional admin-console aesthetic,
- strong information hierarchy,
- restrained use of borders and muted surfaces,
- no decorative gradients,
- no colorful dashboard tiles unless color has a semantic purpose (for example a destructive warning),
- responsive layout,
- accessible keyboard navigation,
- visible focus states,
- usable empty/loading/error states.

Prefer shadcn/ui components such as Sidebar, Card, Table/Data Table, Dialog, Sheet, Form/Input, Select/Combobox, Tabs, Badge, Tooltip, Skeleton, Alert, and Toast where appropriate.

Do not copy a component blindly. Adapt it to the application while preserving the established design language.

## 10. Dashboard direction

A sensible initial information architecture is:

```text
Dashboard
├── Connections
│   ├── Connection profiles
│   ├── Add / edit / test connection
│   ├── Active directory indicator
│   └── Connection diagnostics
│
├── Users
│   ├── Search
│   ├── Filters
│   ├── User table
│   └── User detail
│
├── Directory
│   ├── Discovered naming contexts
│   ├── Available attributes
│   ├── Capabilities
│   └── Discovery diagnostics
│
└── Administration
    ├── Settings
    └── Audit log
```

The active connection profile must always be obvious in the UI. Switching profiles must invalidate or correctly partition any directory-specific cached state.

Do not implement every screen up front. Establish the shell and one useful end-to-end vertical slice first.

## 11. Testing

Every feature should have tests appropriate to its risk.

At minimum:

- unit tests for LDAP mapping/escaping/discovery helpers,
- API/server tests for validation and error handling,
- UI tests for important administrative interactions,
- an integration-test path that can use a test directory or mocked LDAP server without requiring a real production AD.

Never make the test suite depend on a real user's credentials or a live production domain.

At minimum before a PR:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If the project uses different scripts/package manager commands, use the repository's actual equivalents and document them.

## 12. Documentation

Keep these documents current as the project grows:

- `README.md` — setup, development, architecture overview.
- `docs/architecture.md` — major components and data flow.
- `docs/security.md` — secret handling, TLS, authentication/authorization model, audit behavior.
- `docs/decisions/` — important architecture decisions.

Configuration examples must use placeholders such as:

```text
# Application infrastructure only; not the primary directory target configuration.
APP_SECRET_KEY=<set-locally>

# Optional local development bootstrap only. Do not use these as the universal runtime model.
DEV_AD_BOOTSTRAP_HOST=192.0.2.10
DEV_AD_BOOTSTRAP_PORT=636
DEV_AD_BOOTSTRAP_USER=administrator@example.invalid
DEV_AD_BOOTSTRAP_PASSWORD=<set-locally>
```

Production/runtime directory targets should be represented as connection profiles created through the application rather than hard-coded environment variables.

Never use real credentials in documentation.

## 13. Dependency policy

Before adding a dependency:

- confirm it is necessary,
- prefer actively maintained packages,
- avoid duplicate libraries for the same job,
- check licensing and known security concerns,
- pin/update versions according to the project's package manager conventions.

For UI, use shadcn/ui components and the project's existing primitives before adding a separate design-system dependency.

## 14. Scope discipline

This is a focused administration tool, not an attempt to replace all Active Directory management tooling.

Do not add unrelated features such as:

- Group Policy management,
- DNS administration,
- certificate authority administration,
- domain controller lifecycle management,
- arbitrary shell/PowerShell execution,
- credential dumping or discovery,
- offensive security functionality.

Such functionality is outside the current scope unless explicitly introduced through a new, reviewed project decision.

## 15. Definition of Done

A task is done when:

- acceptance criteria are met,
- implementation fits the architecture,
- tests/checks pass,
- no secrets are present in the diff,
- user-facing behavior has appropriate loading/error/empty states,
- security-sensitive behavior is reviewed,
- relevant documentation is updated,
- GitHub Issue and PR context are up to date.

When uncertain, stop at the smallest safe implementation and document the uncertainty. Do not fabricate behavior, AD attributes, server capabilities, or successful test results.


## 16. LDAPS-only project decision

LDAPS is the sole supported Active Directory transport for this project.

Therefore:

- Do not implement Plain LDAP.
- Do not implement StartTLS.
- Do not expose a protocol/security-mode selector in the UI.
- Default to port `636`.
- Allow a custom port only for non-standard LDAPS deployments.
- Prefer an FQDN endpoint matching the certificate identity; do not weaken hostname validation merely because an IP address is supplied.
- Use the system trust store as the default certificate-validation path.
- Support a custom CA/trust mechanism for private enterprise CA environments.
- Any certificate-validation bypass is lab/troubleshooting-only, explicitly labeled unsafe, and never the default.
- Distinguish network, TLS handshake, certificate validation, LDAP protocol, bind, and discovery failures in diagnostics.
- Remove legacy transport options and dead code rather than hiding them behind UI conditionals.

This deliberately simplifies the MVP and keeps the product focused on secure AD administration.
