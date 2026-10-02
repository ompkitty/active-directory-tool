import { describe, expect, it } from 'vitest';
import { classifyNamingContexts, configurationNCFromSchema, deriveCapabilities } from './discovery';
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

  it('handles multiple domains and no configuration NC', () => {
    const result = classifyNamingContexts(['DC=a,DC=x', 'DC=b,DC=x']);
    expect(result.domainNCs).toHaveLength(2);
    expect(result.configurationNC).toBeUndefined();
  });

  it('returns nothing for an empty list', () => {
    expect(classifyNamingContexts([])).toEqual({ domainNCs: [] });
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

  it('enables create when cn and sAMAccountName are discovered', () => {
    const caps = deriveCapabilities({ ...base, attributes: ['cn', 'sAMAccountName', 'mail'] });
    expect(caps.schemaVisible).toBe(true);
    expect(caps.userCreate).toBe(true);
    expect(caps.userModify).toBe(true);
    expect(caps.passwordSet).toBe(true);
  });

  it('requires both cn and sAMAccountName for create', () => {
    const caps = deriveCapabilities({ ...base, attributes: ['cn', 'mail'] });
    expect(caps.userCreate).toBe(false);
    expect(caps.userModify).toBe(true);
  });

  it('marks search unavailable without a base DN', () => {
    const caps = deriveCapabilities({ attributes: ['cn'] });
    expect(caps.userSearch).toBe(false);
  });
});
