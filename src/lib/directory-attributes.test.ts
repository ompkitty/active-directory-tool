import { describe, expect, it } from 'vitest';
import type { DirectoryUser } from '@/types';
import { applyAttributeEdit, isProtectedAttribute, splitUserAttributes } from './directory-attributes';

const user: DirectoryUser = {
  dn: 'CN=Alice Example,OU=Users,DC=example,DC=invalid',
  sAMAccountName: 'a.example',
  userPrincipalName: 'a.example@example.invalid',
  displayName: 'Alice Example',
  enabled: true,
  additionalAttributes: { department: ['IT'] },
};

describe('splitUserAttributes', () => {
  it('groups identity, account, normalized, and additional attributes', () => {
    const sections = splitUserAttributes(user);
    expect(sections.identity.map((r) => r.name)).toEqual([
      'Distinguished name',
      'sAMAccountName',
      'User principal name',
    ]);
    expect(sections.account).toHaveLength(1);
    expect(sections.additional.map((r) => r.name)).toEqual(['department']);
  });

  it('marks missing attributes unavailable instead of hiding them', () => {
    const sections = splitUserAttributes(user);
    const mail = sections.normalized.find((r) => r.name === 'Mail');
    expect(mail?.available).toBe(false);
    expect(mail?.values).toEqual([]);
    const givenName = sections.normalized.find((r) => r.name === 'Given name');
    expect(givenName?.available).toBe(false);
  });

  it('renders unknown account state when enabled is undefined', () => {
    const sections = splitUserAttributes({ ...user, enabled: undefined });
    expect(sections.account[0].values).toEqual(['Unknown']);
    expect(sections.account[0].available).toBe(false);
  });

  it('carries real LDAP attribute names and protects identity/system fields', () => {
    const sections = splitUserAttributes(user);
    const byLabel = new Map(sections.identity.map((r) => [r.name, r]));
    expect(byLabel.get('Distinguished name')?.attribute).toBe('distinguishedName');
    expect(isProtectedAttribute(byLabel.get('Distinguished name')?.attribute ?? '')).toBe(true);
    expect(byLabel.get('sAMAccountName')?.attribute).toBe('sAMAccountName');
    expect(isProtectedAttribute('sAMAccountName')).toBe(false);
    expect(sections.account[0].attribute).toBe('userAccountControl');
    expect(isProtectedAttribute(sections.account[0].attribute)).toBe(true);
  });
});

describe('applyAttributeEdit', () => {
  it('updates a known normalized field', () => {
    const next = applyAttributeEdit(user, 'mail', ['new@example.invalid']);
    expect(next.mail).toBe('new@example.invalid');
  });

  it('preserves existing key casing for additional attributes', () => {
    const withCased: DirectoryUser = {
      ...user,
      additionalAttributes: { telephoneNumber: ['old'] },
    };
    const next = applyAttributeEdit(withCased, 'TELEPHONENUMBER', ['new']);
    expect(next.additionalAttributes['telephoneNumber']).toEqual(['new']);
    expect(next.additionalAttributes).not.toHaveProperty('TELEPHONENUMBER');
  });

  it('adds new additional attributes under the given name', () => {
    const next = applyAttributeEdit(user, 'info', ['a', 'b']);
    expect(next.additionalAttributes['info']).toEqual(['a', 'b']);
  });
});
