import { describe, expect, it } from 'vitest';
import { isProtectedAttribute, validateAttributeEdit } from './mutations';

describe('isProtectedAttribute', () => {
  it.each([
    'distinguishedName',
    'objectGUID',
    'objectSid',
    'memberOf',
    'userAccountControl',
    'pwdLastSet',
    'cn',
    'whenCreated',
  ])('protects %s (case-insensitive)', (name) => {
    expect(isProtectedAttribute(name)).toBe(true);
    expect(isProtectedAttribute(name.toUpperCase())).toBe(true);
  });

  it('allows ordinary attributes', () => {
    expect(isProtectedAttribute('telephoneNumber')).toBe(false);
    expect(isProtectedAttribute('department')).toBe(false);
    expect(isProtectedAttribute('description')).toBe(false);
  });
});

describe('validateAttributeEdit', () => {
  const valid = {
    dn: 'CN=Alice,OU=Users,DC=example,DC=invalid',
    attribute: 'telephoneNumber',
    values: ['+1 555 0100'],
  };

  it('accepts a valid edit', () => {
    expect(validateAttributeEdit(valid)).toBeNull();
  });

  it('rejects bad DNs', () => {
    expect(validateAttributeEdit({ ...valid, dn: '' })).not.toBeNull();
    expect(validateAttributeEdit({ ...valid, dn: 'not-a-dn' })).not.toBeNull();
  });

  it('rejects malformed attribute names', () => {
    expect(validateAttributeEdit({ ...valid, attribute: 'bad;name' })).not.toBeNull();
    expect(validateAttributeEdit({ ...valid, attribute: '' })).not.toBeNull();
  });

  it('rejects protected attributes', () => {
    expect(validateAttributeEdit({ ...valid, attribute: 'memberOf' })).toContain('system-managed');
  });

  it('rejects empty or oversized value lists', () => {
    expect(validateAttributeEdit({ ...valid, values: [] })).not.toBeNull();
    expect(validateAttributeEdit({ ...valid, values: new Array(51).fill('x') })).not.toBeNull();
    expect(validateAttributeEdit({ ...valid, values: [''] })).not.toBeNull();
  });
});
