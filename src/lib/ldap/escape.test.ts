import { describe, expect, it } from 'vitest';
import { buildLdapsUrl, escapeDN, escapeLDAPFilter, validateProfile } from './escape';

describe('escapeLDAPFilter', () => {
  it('escapes RFC 4515 special characters', () => {
    expect(escapeLDAPFilter('a*b(c)d\\')).toBe('a\\2ab\\28c\\29d\\5c');
  });
});

describe('escapeDN', () => {
  it('escapes commas and leading spaces', () => {
    expect(escapeDN('Doe, John')).toBe('Doe\\, John');
    expect(escapeDN(' leading')).toBe('\\ leading');
  });
});

describe('validateProfile', () => {
  it('requires display name, host, bind identity, and sane port', () => {
    const errors = validateProfile({ displayName: '', host: '', bindUser: '', port: 99999 });
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('displayName');
    expect(fields).toContain('host');
    expect(fields).toContain('bindUser');
    expect(fields).toContain('port');
  });

  it('accepts a minimal valid profile', () => {
    const errors = validateProfile({
      displayName: 'Lab',
      host: 'dc01.example.invalid',
      port: 636,
      bindUser: 'administrator@example.invalid',
      bindPassword: 'secret',
    });
    expect(errors).toEqual([]);
  });
});

describe('buildLdapsUrl', () => {
  it('always builds ldaps:// URLs', () => {
    expect(buildLdapsUrl('dc01.example.invalid', 636)).toBe('ldaps://dc01.example.invalid:636');
  });

  it('never builds plain ldap:// URLs and defaults empty ports to 636 (Refs: #10)', () => {
    expect(buildLdapsUrl('dc01.example.invalid', 0)).toBe('ldaps://dc01.example.invalid:636');
    expect(buildLdapsUrl('dc01.example.invalid', 6636)).toMatch(/^ldaps:\/\//);
  });
});
