import { describe, expect, it } from 'vitest';
import {
  classifyNamingContexts,
  configurationNCFromSchema,
  deriveCapabilities,
  parseAttributeNames,
} from './discovery';
import type { DiscoveredMetadata } from '@/types';

describe('classifyNamingContexts', () => {
  it('finds domain, configuration, and schema naming contexts', () => {
    const result = classifyNamingContexts([
      'DC=lab1,DC=local',
      'CN=Configuration,DC=lab1,DC=local',
      'CN=Schema,CN=Configuration,DC=lab1,DC=local',
    ]);
    expect(result.domainNCs).toEqual(['DC=lab1,DC=local']);
    expect(result.configurationNC).toBe('CN=Configuration,DC=lab1,DC=local');
    expect(result.schemaNC).toBe('CN=Schema,CN=Configuration,DC=lab1,DC=local');
  });

  it('excludes DNS zone and configuration contexts from domain NCs (Refs: #3)', () => {
    // Verified against a live Windows Server 2025 lab: the DNS zone contexts
    // are pure DC= chains and were previously misclassified as domains.
    const result = classifyNamingContexts([
      'DC=lab1,DC=local',
      'CN=Configuration,DC=lab1,DC=local',
      'CN=Schema,CN=Configuration,DC=lab1,DC=local',
      'DC=DomainDnsZones,DC=lab1,DC=local',
      'DC=ForestDnsZones,DC=lab1,DC=local',
    ]);
    expect(result.domainNCs).toEqual(['DC=lab1,DC=local']);
  });

  it('orders the default naming context first', () => {
    const result = classifyNamingContexts(
      ['DC=sub,DC=lab1,DC=local', 'DC=lab1,DC=local'],
      'DC=lab1,DC=local',
    );
    expect(result.domainNCs[0]).toBe('DC=lab1,DC=local');
  });

  it('handles multiple domains and no configuration NC', () => {
    const result = classifyNamingContexts(['DC=a,DC=x', 'DC=b,DC=x']);
    expect(result.domainNCs).toHaveLength(2);
    expect(result.configurationNC).toBeUndefined();
  });

  it('returns nothing for an empty list', () => {
    expect(classifyNamingContexts([])).toEqual({ domainNCs: [] });
  });
});

describe('parseAttributeNames', () => {
  it('extracts NAME values from RFC 4512 definitions', () => {
    const names = parseAttributeNames([
      "( 1.2.840.113556.1.4.3 NAME 'cn' SYNTAX '1.3.6.1.4.1.1466.115.121.1.15' SINGLE-VALUE )",
      "( 1.2.840.113556.1.4.21 NAME 'sAMAccountName' SYNTAX '1.3.6.1.4.1.1466.115.121.1.15' SINGLE-VALUE )",
    ]);
    expect(names).toEqual(['cn', 'sAMAccountName']);
  });

  it('ignores malformed names', () => {
    const names = parseAttributeNames(["( 1.2.3 NAME 'bad name' )", "( 1.2.4 NAME '9bad' )"]);
    expect(names).toEqual([]);
  });

  it('deduplicates repeated names', () => {
    const names = parseAttributeNames(["( 1.2.3 NAME 'cn' )", "( 1.2.4 NAME 'cn' )"]);
    expect(names).toEqual(['cn']);
  });
});

describe('configurationNCFromSchema', () => {
  it('derives the configuration NC from the schema NC', () => {
    expect(configurationNCFromSchema('CN=Schema,CN=Configuration,DC=lab1,DC=local')).toBe(
      'CN=Configuration,DC=lab1,DC=local',
    );
  });

  it('returns undefined without a schema NC', () => {
    expect(configurationNCFromSchema(undefined)).toBeUndefined();
  });
});

describe('deriveCapabilities', () => {
  const base: DiscoveredMetadata = {
    defaultNamingContext: 'DC=lab1,DC=local',
    namingContexts: ['DC=lab1,DC=local'],
    effectiveBaseDN: 'DC=lab1,DC=local',
    domainFunctionality: '7',
  };

  it('marks search and browse available when a base DN is known', () => {
    const caps = deriveCapabilities(base);
    expect(caps.userSearch).toBe(true);
    expect(caps.containerBrowse).toBe(true);
    expect(caps.functionalLevels).toBe(true);
  });

  it('marks mutations unavailable when the schema is not visible', () => {
    const caps = deriveCapabilities(base);
    expect(caps.schemaVisible).toBe(false);
    expect(caps.userCreate).toBe(false);
    expect(caps.userModify).toBe(false);
    expect(caps.passwordSet).toBe(false);
  });

  it('enables create when the required attributes are discovered', () => {
    const caps = deriveCapabilities({
      ...base,
      attributes: ['cn', 'sAMAccountName', 'objectClass', 'unicodePwd'],
    });
    expect(caps.schemaVisible).toBe(true);
    expect(caps.userCreate).toBe(true);
    expect(caps.userModify).toBe(true);
    expect(caps.passwordSet).toBe(true);
  });

  it('requires cn, sAMAccountName, and objectClass for create', () => {
    expect(deriveCapabilities({ ...base, attributes: ['cn', 'mail'] }).userCreate).toBe(false);
    expect(
      deriveCapabilities({ ...base, attributes: ['cn', 'sAMAccountName'] }).userCreate,
    ).toBe(false);
  });

  it('requires unicodePwd for password set', () => {
    expect(deriveCapabilities({ ...base, attributes: ['cn', 'sAMAccountName'] }).passwordSet).toBe(
      false,
    );
  });

  it('treats a non-empty total count as a visible schema even with a small sample', () => {
    const caps = deriveCapabilities({ ...base, attributes: ['description'], schemaAttributeCount: 1506 });
    expect(caps.schemaVisible).toBe(true);
    expect(caps.userModify).toBe(true);
  });

  it('uses the full attribute set, not the display sample (Refs: #3)', () => {
    // Live lab: 1506 attributes, sample shows only the first 200 alphabetically,
    // so cn/sAMAccountName/unicodePwd are absent from the sample but present.
    const sample = ['Enabled', 'aCSAggregateTokenRatePerUser', 'aCSAllocableRSVPBandwidth'];
    const all = [...sample, 'cn', 'objectClass', 'sAMAccountName', 'unicodePwd'];
    const caps = deriveCapabilities(
      { ...base, attributes: sample, schemaAttributeCount: all.length },
      all,
    );
    expect(caps.userCreate).toBe(true);
    expect(caps.passwordSet).toBe(true);
  });

  it('marks search unavailable without a base DN', () => {
    const caps = deriveCapabilities({ attributes: ['cn'] });
    expect(caps.userSearch).toBe(false);
  });
});
