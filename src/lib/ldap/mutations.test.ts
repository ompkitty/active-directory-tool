import { describe, expect, it } from 'vitest';
import {
  isAccountEnabledFlags,
  isProtectedAttribute,
  validateAttributeEdit,
  withAccountEnabled,
} from './mutations';

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

describe('account state flags', () => {
  it('reads the ACCOUNTDISABLE bit', () => {
    expect(isAccountEnabledFlags(512)).toBe(true);
    expect(isAccountEnabledFlags(514)).toBe(false);
    expect(isAccountEnabledFlags(66048)).toBe(true);
    expect(isAccountEnabledFlags(66050)).toBe(false);
  });

  it('flips only the ACCOUNTDISABLE bit, preserving other flags', () => {
    expect(withAccountEnabled(512, false)).toBe(514);
    expect(withAccountEnabled(514, true)).toBe(512);
    expect(withAccountEnabled(66048, false)).toBe(66050);
    expect(withAccountEnabled(66050, true)).toBe(66048);
    // No-op when already in the desired state.
    expect(withAccountEnabled(512, true)).toBe(512);
    expect(withAccountEnabled(514, false)).toBe(514);
  });
});
