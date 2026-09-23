import { describe, expect, it } from 'vitest';
import type { DirectoryUser } from '@/types';
import { splitUserAttributes } from './directory-attributes';

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
});
