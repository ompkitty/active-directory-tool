import { describe, expect, it } from 'vitest';
import type { Entry } from 'ldapts';
import {
  buildUserSearchFilter,
  normalizeUser,
  USER_SEARCH_LIMIT_MAX,
} from './users';

describe('buildUserSearchFilter', () => {
  it('constrains results to person/user object classes', () => {
    const filter = buildUserSearchFilter('alice');
    expect(filter).toContain('(objectCategory=person)');
    expect(filter).toContain('(objectClass=user)');
  });

  it('escapes RFC 4515 special characters in the query', () => {
    const filter = buildUserSearchFilter('a*b(c)d\\');
    expect(filter).toContain('a\\2ab\\28c\\29d\\5c');
    expect(filter).not.toContain('a*b(c)d\\');
  });

  it('returns a plain listing filter for an empty query', () => {
    expect(buildUserSearchFilter('   ')).toBe('(&(objectCategory=person)(objectClass=user))');
  });

  it('searches identity attributes with substring match', () => {
    const filter = buildUserSearchFilter('alice');
    for (const attr of ['sAMAccountName', 'cn', 'displayName', 'userPrincipalName', 'mail']) {
      expect(filter).toContain(`(${attr}=*alice*)`);
    }
  });
});

describe('normalizeUser', () => {
  const base: Entry = {
    dn: 'CN=Alice Example,OU=Users,DC=example,DC=invalid',
    sAMAccountName: 'a.example',
    userPrincipalName: 'a.example@example.invalid',
    displayName: 'Alice Example',
    givenName: 'Alice',
    sn: 'Example',
    mail: 'a.example@example.invalid',
    userAccountControl: '512',
    department: 'IT',
    employeeID: ['123', '456'],
  };

  it('maps known attributes to friendly fields', () => {
    const user = normalizeUser(base);
    expect(user.dn).toBe(base.dn);
    expect(user.sAMAccountName).toBe('a.example');
    expect(user.userPrincipalName).toBe('a.example@example.invalid');
    expect(user.displayName).toBe('Alice Example');
    expect(user.givenName).toBe('Alice');
    expect(user.surname).toBe('Example');
    expect(user.mail).toBe('a.example@example.invalid');
  });

  it('derives enabled from userAccountControl (512 enabled, 514 disabled)', () => {
    expect(normalizeUser({ ...base, userAccountControl: '512' }).enabled).toBe(true);
    expect(normalizeUser({ ...base, userAccountControl: '514' }).enabled).toBe(false);
    expect(normalizeUser({ ...base, userAccountControl: '66048' }).enabled).toBe(true);
  });

  it('leaves enabled undefined when userAccountControl is missing', () => {
    const rest = { ...base };
    delete rest.userAccountControl;
    expect(normalizeUser(rest).enabled).toBeUndefined();
  });

  it('preserves unknown attributes instead of dropping them', () => {
    const user = normalizeUser(base);
    expect(user.additionalAttributes['department']).toEqual(['IT']);
    expect(user.additionalAttributes['employeeid']).toEqual(['123', '456']);
    expect(user.additionalAttributes).not.toHaveProperty('samaccountname');
    expect(user.additionalAttributes).not.toHaveProperty('useraccountcontrol');
  });

  it('encodes binary values as base64', () => {
    const user = normalizeUser({ ...base, objectGUID: Buffer.from([0x01, 0x02, 0x03]) });
    expect(user.additionalAttributes['objectguid']).toEqual([Buffer.from([0x01, 0x02, 0x03]).toString('base64')]);
  });
});

describe('user search limits', () => {
  it('documents the server-side maximum', () => {
    expect(USER_SEARCH_LIMIT_MAX).toBe(200);
  });
});
