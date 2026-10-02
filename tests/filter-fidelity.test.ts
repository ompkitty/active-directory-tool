import { describe, expect, it } from 'vitest';
import { entryMatchesFilter, LAB_USER, LAB_OU } from './fake-directory';
import { buildUserSearchFilter } from '@/lib/ldap/users';

describe('FakeDirectory filter evaluator fidelity', () => {
  it('matches the filter this application builds', () => {
    const filter = buildUserSearchFilter('alice');
    expect(entryMatchesFilter(LAB_USER, filter)).toBe(true);
  });

  it('rejects non-users for the same filter', () => {
    expect(entryMatchesFilter(LAB_OU, buildUserSearchFilter('alice'))).toBe(false);
  });

  it('treats attr=* as a presence check', () => {
    expect(entryMatchesFilter(LAB_USER, '(cn=*)')).toBe(true);
    expect(entryMatchesFilter({ dn: 'x' }, '(cn=*)')).toBe(false);
  });

  it('supports AND, OR and NOT', () => {
    expect(entryMatchesFilter(LAB_USER, '(&(objectClass=user)(sn=Example))')).toBe(true);
    expect(entryMatchesFilter(LAB_USER, '(|(sn=Nope)(sn=Example))')).toBe(true);
    expect(entryMatchesFilter(LAB_USER, '(!(sn=Nope))')).toBe(true);
  });
});
