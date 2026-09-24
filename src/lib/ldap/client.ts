import { Attribute, Change, Client, type Entry } from 'ldapts';
import type { ConnectionProfile, Diagnostics, DiscoveredMetadata } from '@/types';
import { buildLdapsUrl } from './escape';

export interface StagedResult {
  diagnostics: Diagnostics;
  metadata?: DiscoveredMetadata;
  failedStage?: keyof Diagnostics;
  /** Safe, user-facing message. */
  message?: string;
}

/** Thrown by readAttribute when the entry itself is absent. */
export const ENTRY_NOT_FOUND = 'Entry not found.';

/** Internal error carrying the failed stage plus a UI-safe message. */
export class LdapStageError extends Error {
  stage: keyof Diagnostics;
  constructor(stage: keyof Diagnostics, message: string) {
    super(message);
    this.stage = stage;
  }
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
  private createClient(profile: ConnectionProfile): Client {
    const insecure = profile.allowInsecure === true || profile.certValidation === false;
    return new Client({
      url: buildLdapsUrl(profile.host, profile.port || 636),
      timeout: profile.searchTimeout ?? 8000,
      connectTimeout: profile.connectTimeout ?? 8000,
      tlsOptions: {
        // System trust store by default; NODE_EXTRA_CA_CERTS adds enterprise CAs.
        rejectUnauthorized: !insecure,
        servername: profile.host.trim(),
      },
    });
  }

  /**
   * Connect + bind. Network, TLS handshake, and certificate validation happen
   * during bind against an ldaps:// URL (TLS is established before any LDAP PDU).
   */
  private async connectAndBind(profile: ConnectionProfile): Promise<Client> {
    const client = this.createClient(profile);
    try {
      await client.bind(profile.bindUser, profile.bindPassword ?? '');
      return client;
    } catch (err) {
      const mapped = mapBindError(err);
      try {
        await client.unbind();
      } catch {
        // Best-effort cleanup.
      }
      throw new LdapStageError(mapped.failedStage ?? 'ldap', mapped.message ?? 'LDAP operation failed.');
    }
  }

  private async readRootDSE(client: Client, searchTimeoutMs: number): Promise<Record<string, unknown>> {
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
        timeLimit: Math.max(1, Math.ceil(searchTimeoutMs / 1000)),
      });
      return (searchEntries[0] ?? {}) as Record<string, unknown>;
    } catch {
      throw new LdapStageError(
        'rootDSE',
        'Connected and bound, but RootDSE could not be read (permissions or server policy).',
      );
    }
  }

  async testConnection(profile: ConnectionProfile): Promise<StagedResult> {
    const diagnostics = emptyDiagnostics();
    const insecure = profile.allowInsecure === true || profile.certValidation === false;

    let client: Client;
    try {
      client = await this.connectAndBind(profile);
    } catch (err) {
      const safe = toSafeError(err);
      return { diagnostics, failedStage: safe.failedStage, message: safe.message };
    }

    try {
      diagnostics.network = true;
      diagnostics.tlsHandshake = true;
      diagnostics.certValidation = !insecure ? true : false;
      diagnostics.ldap = true;
      diagnostics.bind = true;

      let rootDSE: Record<string, unknown>;
      try {
        rootDSE = await this.readRootDSE(client, profile.searchTimeout ?? 8000);
      } catch (err) {
        const safe = toSafeError(err);
        return { diagnostics, failedStage: safe.failedStage, message: safe.message };
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
      diagnostics.rootDSE = true;
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

  /**
   * Bind, resolve the effective base DN via RootDSE (override wins), and run a
   * caller-supplied subtree search. The caller owns filter construction and
   * must escape all user input (see escapeLDAPFilter).
   */
  async searchSubtree(
    profile: ConnectionProfile,
    options: { filter: string; attributes: string[]; limit: number },
  ): Promise<{ entries: Entry[]; baseDN: string }> {
    const client = await this.connectAndBind(profile);
    try {
      const rootDSE = await this.readRootDSE(client, profile.searchTimeout ?? 8000);
      const baseDN = profile.baseDN?.trim() || firstString(rootDSE['defaultNamingContext']) || '';
      if (!baseDN) {
        throw new LdapStageError(
          'discovery',
          'No base DN available: discovery returned no default naming context and no override is set.',
        );
      }
      const { searchEntries } = await client.search(baseDN, {
        scope: 'sub',
        filter: options.filter,
        attributes: options.attributes,
        sizeLimit: options.limit,
        timeLimit: Math.max(1, Math.ceil((profile.searchTimeout ?? 8000) / 1000)),
      });
      return { entries: searchEntries, baseDN };
    } catch (err) {
      if (err instanceof LdapStageError) throw err;
      const mapped = mapBindError(err);
      throw new LdapStageError(mapped.failedStage ?? 'ldap', mapped.message ?? 'LDAP search failed.');
    } finally {
      try {
        await client.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /**
   * Read one attribute's values via an isolated bound connection.
   * Returns an empty array when the entry exists but lacks the attribute.
   */
  async readAttribute(profile: ConnectionProfile, dn: string, attribute: string): Promise<string[]> {
    const reader = await this.connectAndBind(profile);
    try {
      const { searchEntries } = await reader.search(dn, {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: [attribute],
        timeLimit: Math.max(1, Math.ceil((profile.searchTimeout ?? 8000) / 1000)),
      });
      const entry = searchEntries[0];
      if (!entry) throw new LdapStageError('ldap', ENTRY_NOT_FOUND);
      const key = Object.keys(entry).find((k) => k.toLowerCase() === attribute.toLowerCase());
      const raw = key ? entry[key] : undefined;
      if (raw === undefined) return [];
      const list = Array.isArray(raw) ? raw : [raw];
      return list.map((v) => (Buffer.isBuffer(v) ? v.toString('base64') : String(v)));
    } finally {
      try {
        await reader.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /**
   * Add a new entry via an isolated bound connection.
   */
  async addEntry(
    profile: ConnectionProfile,
    dn: string,
    attributes: Record<string, string | string[]>,
  ): Promise<void> {
    const client = await this.connectAndBind(profile);
    try {
      await client.add(dn, attributes);
    } finally {
      try {
        await client.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /**
   * Replace one attribute with binary values (e.g. unicodePwd).
   * LDAPS-only by construction: this client never speaks plain LDAP.
   */
  async modifyBinary(
    profile: ConnectionProfile,
    dn: string,
    attribute: string,
    value: Buffer,
  ): Promise<void> {
    const client = await this.connectAndBind(profile);
    try {
      await client.modify(
        dn,
        new Change({ operation: 'replace', modification: new Attribute({ type: attribute, values: [value] }) }),
      );
    } finally {
      try {
        await client.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /**
   * Delete one entry via an isolated bound connection.
   */
  async deleteEntry(profile: ConnectionProfile, dn: string): Promise<void> {
    const client = await this.connectAndBind(profile);
    try {
      await client.del(dn);
    } finally {
      try {
        await client.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /**
   * Move/rename an entry to a new DN via an isolated bound connection.
   */
  async moveEntry(profile: ConnectionProfile, dn: string, newDN: string): Promise<void> {
    const client = await this.connectAndBind(profile);
    try {
      await client.modifyDN(dn, newDN);
    } finally {
      try {
        await client.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /**
   * Replace one attribute's values and re-read them for verification.
   * Short isolated connections keep each step independent.
   */
  async modifyReplace(
    profile: ConnectionProfile,
    dn: string,
    attribute: string,
    values: string[],
  ): Promise<string[]> {
    const modifier = await this.connectAndBind(profile);
    try {
      await modifier.modify(
        dn,
        new Change({ operation: 'replace', modification: new Attribute({ type: attribute, values }) }),
      );
    } finally {
      try {
        await modifier.unbind();
      } catch {
        // Best-effort cleanup.
      }
    }

    return this.readAttribute(profile, dn, attribute);
  }
}

/** Map a low-level error to a stage + UI-safe message (no secrets, no internals). */
export function toSafeError(err: unknown): { failedStage: keyof Diagnostics; message: string } {
  if (err instanceof LdapStageError) return { failedStage: err.stage, message: err.message };
  const mapped = mapBindError(err);
  return { failedStage: mapped.failedStage ?? 'ldap', message: mapped.message ?? 'LDAP operation failed.' };
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
  if (lower.includes('sizelimit exceeded') || lower.includes('size limit')) {
    return { failedStage: 'ldap', message: 'Server size limit exceeded. Narrow the search query.' };
  }
  if (lower.includes('handshake')) {
    return { failedStage: 'tlsHandshake', message: 'TLS handshake failed. The server may not offer LDAPS on this port.' };
  }
  return { failedStage: 'ldap', message: 'LDAP operation failed. Check bind identity format and server availability.' };
}
