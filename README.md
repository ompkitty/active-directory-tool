# Active Directory Tool

Web-based Active Directory administration panel with LDAPS connection profiles.

## Features

- Multiple AD connection profiles (different domains, forests, labs)
- LDAPS only - no Plain LDAP or StartTLS
- Automatic directory discovery (RootDSE, naming contexts)
- Server-side LDAP communication
- shadcn/ui monochrome design

## Development

```bash
npm install
npm run dev
```

## Security

- LDAP communication server-side only
- Bind passwords never logged or exposed to browser
- TLS certificate validation required by default
- No secrets committed

## Status

Initial scaffold - MVP in progress.
