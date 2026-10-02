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

/**
 * Classify discovered naming contexts: domain NCs contain DC= components,
 * the configuration NC starts with CN=Configuration. Nothing is hard-coded
 * per environment.
 */
export function classifyNamingContexts(namingContexts: string[]): {
  domainNCs: string[];
  configurationNC?: string;
  schemaNC?: string;
} {
  // A domain NC consists purely of DC= components. Matching any ',DC=' would
  // wrongly classify CN=Configuration,DC=... as a domain.
  const domainNCs = namingContexts.filter((nc) =>
    nc.split(',').every((rdn) => rdn.trim().toLowerCase().startsWith('dc=')),
  );
  const configurationNC = namingContexts.find((nc) => /^CN=Configuration/i.test(nc));
  const schemaNC = namingContexts.find((nc) => /^CN=Schema/i.test(nc));
  return { domainNCs, configurationNC, schemaNC };
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
  const { domainNCs, configurationNC, schemaNC } = classifyNamingContexts(namingContexts);
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

  if (metadata.configurationNamingContext) {
    try {
      const entries = await client.readBase(profile, metadata.configurationNamingContext, {
        filter: '(&(objectClass=top)(cn=Subschema))',
        attributes: ['objectClasses'],
      });
      const raw = stringArray(entries[0]?.objectClasses) ?? [];
      const attributes = raw
        .flatMap((oc) => oc.split('$'))
        .map((a) => a.trim())
        .filter((a) => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(a));
      const unique = Array.from(new Set(attributes)).sort();
      if (unique.length > 0) {
        metadata.attributes = unique.slice(0, ATTRIBUTE_SAMPLE_LIMIT);
        if (unique.length > ATTRIBUTE_SAMPLE_LIMIT) {
          notes.push(`Attribute list truncated to ${ATTRIBUTE_SAMPLE_LIMIT} of ${unique.length}.`);
        }
      } else {
        notes.push('Subschema attribute list not readable (permissions or attributes).');
      }
    } catch {
      notes.push('Subschema read failed (permissions or server policy).');
    }
  }

  metadata.capabilities = deriveCapabilities(metadata);
  return { metadata, notes };
}

/**
 * Capabilities are derived only from what discovery actually observed, so the
 * UI can show unavailable features instead of assuming support.
 */
export function deriveCapabilities(metadata: DiscoveredMetadata): Record<string, boolean> {
  const attributes = (metadata.attributes ?? []).map((a) => a.toLowerCase());
  const schemaVisible = attributes.length > 0;
  return {
    userSearch: Boolean(metadata.effectiveBaseDN),
    userCreate: schemaVisible && attributes.includes('cn') && attributes.includes('samaccountname'),
    userModify: schemaVisible,
    userDelete: schemaVisible,
    passwordSet: schemaVisible,
    containerBrowse: Boolean(metadata.effectiveBaseDN),
    schemaVisible,
    functionalLevels: Boolean(metadata.domainFunctionality || metadata.forestFunctionality),
  };
}
