import { Client } from 'ldapts';
import type { ConnectionProfile, Diagnostics, DiscoveredMetadata } from '@/types';
import { buildLdapsUrl } from './escape';

export interface StagedResult {
  diagnostics: Diagnostics;
  metadata?: DiscoveredMetadata;
  failedStage?: keyof Diagnostics;
  /** Safe, user-facing message. */
  message?: string;
}

function emptyDiagnostics(): Diagnostics {
  return {
    network: false,
    tlsHandshake: false,
    certValidation: false,
    ldap: false,
    rootDSE: false,
    bind: false,
    discovery: false,
  };
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return undefined;
}

/**
 * LDAPS-only client. Plain LDAP and StartTLS are intentionally unsupported:
 * URLs are always built as ldaps:// and no StartTLS code path exists.
 */
export class LDAPClient {
  async testConnection(profile: ConnectionProfile): Promise<StagedResult> {
    const diagnostics = emptyDiagnostics();
    const url = buildLdapsUrl(profile.host, profile.port || 636);
    const insecure = profile.allowInsecure === true || profile.certValidation === false;

    const client = new Client({
      url,
      timeout: profile.searchTimeout ?? 8000,
      connectTimeout: profile.connectTimeout ?? 8000,
      tlsOptions: {
        // System trust store by default; NODE_EXTRA_CA_CERTS adds enterprise CAs.
        rejectUnauthorized: !insecure,
        servername: profile.host.trim(),
      },
    });

    try {
      // Network + TLS handshake + certificate validation happen during bind
      // against an ldaps:// URL (TLS is established before any LDAP PDU).
      try {
        await client.bind(profile.bindUser, profile.bindPassword ?? '');
      } catch (err) {
        const mapped = mapBindError(err);
        return { diagnostics, ...mapped };
      }
      diagnostics.network = true;
      diagnostics.tlsHandshake = true;
      diagnostics.certValidation = !insecure ? true : false;
      diagnostics.ldap = true;
      diagnostics.bind = true;

      // RootDSE read (anonymous-style base search after bind for AD).
      let rootDSE: Record<string, unknown>;
      try {
        const { searchEntries } = await client.search('', {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: [
            'defaultNamingContext',
            'namingContexts',
            'dnsHostName',
            'domainFunctionality',
            'forestFunctionality',
            'schemaNamingContext',
          ],
          timeLimit: Math.ceil((profile.searchTimeout ?? 8000) / 1000),
        });
        rootDSE = (searchEntries[0] ?? {}) as Record<string, unknown>;
        diagnostics.rootDSE = true;
      } catch {
        return {
          diagnostics,
          failedStage: 'rootDSE',
          message: 'Connected and bound, but RootDSE could not be read (permissions or server policy).',
        };
      }

      const metadata: DiscoveredMetadata = {
        defaultNamingContext: firstString(rootDSE['defaultNamingContext']),
        namingContexts: stringArray(rootDSE['namingContexts']),
        dnsHostName: firstString(rootDSE['dnsHostName']),
        domainFunctionality: firstString(rootDSE['domainFunctionality']),
        forestFunctionality: firstString(rootDSE['forestFunctionality']),
        schemaNamingContext: firstString(rootDSE['schemaNamingContext']),
        effectiveBaseDN: profile.baseDN?.trim() || firstString(rootDSE['defaultNamingContext']),
      };
      diagnostics.discovery = true;
      return { diagnostics, metadata };
    } finally {
      try {
        await client.unbind();
      } catch {
        // Ignore unbind errors; connection cleanup is best-effort.
      }
    }
  }
}

function mapBindError(err: unknown): Pick<StagedResult, 'failedStage' | 'message'> {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('certificate') ||
    lower.includes('self-signed') ||
    lower.includes('unable to verify') ||
    lower.includes('cert_') ||
    lower.includes('ssl') ||
    lower.includes('tls')
  ) {
    return {
      failedStage: 'certValidation',
      message: 'TLS certificate validation failed. Trust the enterprise CA (NODE_EXTRA_CA_CERTS) or check the FQDN matches the certificate.',
    };
  }
  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('timeout')) {
    return {
      failedStage: 'network',
      message: 'Host unreachable or connection timed out. Check hostname, port 636, and network path.',
    };
  }
  if (lower.includes('invalid credentials') || lower.includes('invalidcredentials') || lower.includes('49 ')) {
    return { failedStage: 'bind', message: 'Bind failed: invalid credentials.' };
  }
  if (lower.includes('handshake')) {
    return { failedStage: 'tlsHandshake', message: 'TLS handshake failed. The server may not offer LDAPS on this port.' };
  }
  return { failedStage: 'ldap', message: 'LDAP operation failed. Check bind identity format and server availability.' };
}
