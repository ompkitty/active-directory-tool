# Architecture

## Layers

Web UI -> Server/API -> AD Service -> LDAP Client

## Connection Profile Model

Each profile isolated:
- endpoint configuration
- credentials/secrets
- discovered metadata
- caches

## Discovery First

RootDSE, naming contexts, attributes discovered per profile.

No hard-coded AD assumptions.
