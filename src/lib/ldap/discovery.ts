import { LDAPClient } from './client';
import { validateProfile } from './escape';
import type { ConnectionProfile, DiscoveredMetadata } from '@/types';

const ROOTDSE_ATTRIBUTES = [
  'defaultNamingContext',
  'namingContexts',
  'dnsHostName',
  'domainFunctionality',
  'forestFunctionality',
  'schemaNamingContext',
  'dnsForestRoot',
];

export interface DiscoveryReport {
  metadata: DiscoveredMetadata;
  /** Human-readable notes for steps that were skipped or degraded. */
  notes: string[];
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

/** Naming contexts that are zones/app partitions, never a domain NC. */
const NON_DOMAIN_NC_PREFIXES = ['dc=domaindnszones', 'dc=forestdnszones', 'dc=configuration', 'cn=configuration'];

/**
 * Classify discovered naming contexts. A domain NC is a pure DC= chain that
 * is not a DNS zone, configuration, or schema context. The default naming
 * context wins when present, since that is the directory's own domain.
 */
export function classifyNamingContexts(
  namingContexts: string[],
  defaultNamingContext?: string,
): {
  domainNCs: string[];
  configurationNC?: string;
  schemaNC?: string;
} {
  const isPureDCChain = (nc: string) =>
    nc.split(',').every((rdn) => rdn.trim().toLowerCase().startsWith('dc='));
  const isNonDomain = (nc: string) =>
    NON_DOMAIN_NC_PREFIXES.some((p) => nc.trim().toLowerCase().startsWith(p));

  const domainNCs = namingContexts.filter((nc) => isPureDCChain(nc) && !isNonDomain(nc));

  // The default naming context is authoritative when it is a domain NC.
  if (defaultNamingContext && domainNCs.includes(defaultNamingContext)) {
    return {
      domainNCs: [
        defaultNamingContext,
        ...domainNCs.filter((nc) => nc !== defaultNamingContext),
      ],
      configurationNC: namingContexts.find((nc) => /^CN=Configuration/i.test(nc)),
      schemaNC: namingContexts.find((nc) => /^CN=Schema/i.test(nc)),
    };
  }

  return {
    domainNCs,
    configurationNC: namingContexts.find((nc) => /^CN=Configuration/i.test(nc)),
    schemaNC: namingContexts.find((nc) => /^CN=Schema/i.test(nc)),
  };
}

/**
 * Extract attribute names from RFC 4512 schema definitions such as
 * "( 1.2.3 NAME 'cn' SYNTAX '1.2' SINGLE-VALUE )".
 */
export function parseAttributeNames(definitions: string[]): string[] {
  const names = new Set<string>();
  for (const def of definitions) {
    for (const m of def.matchAll(/\bNAME\s+'([^']+)'/gi)) {
      const name = m[1];
      if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) names.add(name);
    }
  }
  return Array.from(names).sort();
}

/** Fallback: CN=Schema,... -> CN=Configuration,... */
export function configurationNCFromSchema(schemaNC?: string): string | undefined {
  if (!schemaNC) return undefined;
  // "CN=Schema,CN=Configuration,DC=x" -> "CN=Configuration,DC=x"
  const [, ...rest] = schemaNC.split(',');
  if (rest.length === 0) return undefined;
  return rest.join(',');
}

const ATTRIBUTE_SAMPLE_LIMIT = 200;

/**
 * Full per-profile discovery: RootDSE plus domain host, forest root,
 * configuration NC, and schema attribute names. Optional steps degrade to
 * notes instead of failing the whole report.
 */
export async function discoverDirectory(profile: ConnectionProfile): Promise<DiscoveryReport> {
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new Error(errors[0].message);
  if (!profile.bindPassword) throw new Error('Bind password is required.');

  const client = new LDAPClient();
  const notes: string[] = [];
  let discoveredAttributes: string[] = [];

  const { rootDSE } = await client.bindAndReadRootDSE(profile, ROOTDSE_ATTRIBUTES);

  const metadata: DiscoveredMetadata = {
    defaultNamingContext: firstString(rootDSE.defaultNamingContext),
    namingContexts: stringArray(rootDSE.namingContexts),
    dnsHostName: firstString(rootDSE.dnsHostName),
    domainFunctionality: firstString(rootDSE.domainFunctionality),
    forestFunctionality: firstString(rootDSE.forestFunctionality),
    schemaNamingContext: firstString(rootDSE.schemaNamingContext),
    dnsForestRoot: firstString(rootDSE.dnsForestRoot),
    effectiveBaseDN: profile.baseDN?.trim() || firstString(rootDSE.defaultNamingContext),
    discoveredAt: new Date().toISOString(),
  };

  const namingContexts = metadata.namingContexts ?? [];
  const { domainNCs, configurationNC, schemaNC } = classifyNamingContexts(
    namingContexts,
    metadata.defaultNamingContext,
  );
  metadata.configurationNamingContext =
    configurationNC ?? configurationNCFromSchema(schemaNC ?? metadata.schemaNamingContext);
  if (!metadata.configurationNamingContext) {
    notes.push('Configuration naming context not exposed by this directory.');
  }
  if (domainNCs.length === 0) {
    notes.push('No domain naming context (DC= entry) among the naming contexts.');
  }

  if (domainNCs.length > 0) {
    try {
      const entries = await client.readBase(profile, domainNCs[0], {
        filter: '(objectClass=*)',
        attributes: ['dnsHostName'],
      });
      metadata.domainDnsHostName = firstString(entries[0]?.dnsHostName) ?? metadata.domainDnsHostName;
      if (!metadata.domainDnsHostName) {
        notes.push('Domain DNS host name not readable (permissions or attributes).');
      }
    } catch {
      notes.push('Domain naming context read failed (permissions or server policy).');
    }
  }

  // Schema attribute names.
  //
  // Active Directory has no CN=Subschema entry (that is a generic LDAP
  // construct). Schema definitions live on the subSchema children of the
  // schema NC, e.g. CN=Aggregate,CN=Schema,... carrying attributeTypes.
  if (schemaNC ?? metadata.schemaNamingContext) {
    const schemaBase = schemaNC ?? (metadata.schemaNamingContext as string);
    try {
      const definitions = await client.readSubtree(
        profile,
        schemaBase,
        {
          scope: 'one',
          filter: '(objectClass=subSchema)',
          attributes: ['attributeTypes'],
        },
        200,
      );
      const names = parseAttributeNames(definitions);
      discoveredAttributes = names;
      if (names.length > 0) {
        // Capabilities must be derived from the full set, not the sample the
        // UI receives (common names sort past the cap).
        metadata.schemaAttributeCount = names.length;
        metadata.attributes = names.slice(0, ATTRIBUTE_SAMPLE_LIMIT);
        if (names.length > ATTRIBUTE_SAMPLE_LIMIT) {
          notes.push(
            `Showing ${ATTRIBUTE_SAMPLE_LIMIT} of ${names.length} discovered attributes; capabilities use the full set.`,
          );
        }
      } else {
        notes.push('Schema read returned no attribute definitions (permissions or server policy).');
      }
    } catch {
      notes.push('Schema read failed (permissions or server policy).');
    }
  } else {
    notes.push('Schema naming context not exposed by this directory.');
  }

  metadata.capabilities = deriveCapabilities(metadata, discoveredAttributes);
  return { metadata, notes };
}

/**
 * Capabilities are derived only from what discovery actually observed, so the
 * UI can show unavailable features instead of assuming support.
 */
export function deriveCapabilities(
  metadata: DiscoveredMetadata,
  /** Full discovered set; metadata.attributes is only a display sample. */
  allAttributes: string[] = metadata.attributes ?? [],
): Record<string, boolean> {
  const attributes = allAttributes.map((a) => a.toLowerCase());
  const schemaVisible = attributes.length > 0 || (metadata.schemaAttributeCount ?? 0) > 0;
  const has = (name: string) => attributes.includes(name.toLowerCase());
  return {
    userSearch: Boolean(metadata.effectiveBaseDN),
    userCreate: schemaVisible && has('cn') && has('samaccountname') && has('objectclass'),
    userModify: schemaVisible,
    userDelete: schemaVisible,
    passwordSet: schemaVisible && has('unicodepwd'),
    containerBrowse: Boolean(metadata.effectiveBaseDN),
    schemaVisible,
    functionalLevels: Boolean(metadata.domainFunctionality || metadata.forestFunctionality),
  };
}
