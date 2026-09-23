import { describe, expect, it } from 'vitest';
import {
  buildUserDN,
  defaultDisplayName,
  encodePassword,
  isAccountEnabledFlags,
  isProtectedAttribute,
  modifyErrorMessage,
  validateAttributeEdit,
  validateCreateUserInput,
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

describe('modifyErrorMessage', () => {
  it('explains unknown schema attributes with the attribute name', () => {
    const msg = modifyErrorMessage(
      new Error('00000057: LdapErr: DSID-0C090E87, comment: Error in attribute conversion operation'),
      'myCustomAttr',
    );
    expect(msg).toContain("'myCustomAttr'");
    expect(msg).toContain('schema');
  });

  it('explains object class violations', () => {
    const msg = modifyErrorMessage(
      new Error('0000207D: UpdErr: DSID-030511CF, problem 6002 (OBJ_CLASS_VIOLATION)'),
      'myCustomAttr',
    );
    expect(msg).toContain('not permitted');
  });

  it('keeps rights and not-found mappings', () => {
    expect(modifyErrorMessage(new Error('Insufficient Access Rights'))).toContain('Insufficient access');
    expect(modifyErrorMessage(new Error('No Such Object'))).toContain('not found');
  });
});describe('account state flags', () => {
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

describe('create user helpers', () => {
  it('encodes passwords as quoted UTF-16LE for unicodePwd', () => {
    // '"x"' -> 22 00 | 78 00 | 22 00
    expect(encodePassword('x').equals(Buffer.from([0x22, 0x00, 0x78, 0x00, 0x22, 0x00]))).toBe(true);
  });

  it('builds display names and escapes DN components', () => {
    expect(defaultDisplayName('Alice', 'Example')).toBe('Alice Example');
    expect(buildUserDN('Doe, John', 'OU=Users,DC=example,DC=invalid')).toBe(
      'CN=Doe\\, John,OU=Users,DC=example,DC=invalid',
    );
  });

  it('accepts a valid create input', () => {
    expect(
      validateCreateUserInput({
        parentDN: 'OU=Users,DC=example,DC=invalid',
        sAMAccountName: 'a.example',
        givenName: 'Alice',
        surname: 'Example',
        password: 'S3cure-Passphrase!',
        enableAfterCreate: true,
      }),
    ).toBeNull();
  });

  it('rejects bad account names, names, UPNs, and passwords', () => {
    const base = {
      parentDN: 'OU=Users,DC=example,DC=invalid',
      sAMAccountName: 'a.example',
      givenName: 'Alice',
      surname: 'Example',
      password: 'S3cure-Passphrase!',
      enableAfterCreate: true,
    };
    expect(validateCreateUserInput({ ...base, sAMAccountName: 'way-too-long-account-name-here' })).not.toBeNull();
    expect(validateCreateUserInput({ ...base, sAMAccountName: 'bad name!' })).not.toBeNull();
    expect(validateCreateUserInput({ ...base, givenName: '' })).not.toBeNull();
    expect(validateCreateUserInput({ ...base, userPrincipalName: 'not-an-upn' })).not.toBeNull();
    expect(validateCreateUserInput({ ...base, password: 'short' })).not.toBeNull();
    expect(validateCreateUserInput({ ...base, parentDN: 'not-a-dn' })).not.toBeNull();
  });
});
