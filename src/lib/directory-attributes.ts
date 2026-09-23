import type { DirectoryUser } from '@/types';

/**
 * Attributes that cannot be edited through the generic single-attribute
 * editor. Reasons: DN identity (renaming needs a move/rename op), system-only
 * or constructed attributes the server owns, and attributes with special
 * semantics that deserve their own controlled operation (e.g. enable/disable
 * for userAccountControl, password reset for unicodePwd).
 */
const PROTECTED_ATTRIBUTES = new Set([
  'distinguishedname',
  'cn',
  'name',
  'objectguid',
  'objectsid',
  'objectcategory',
  'objectclass',
  'instancetype',
  'whencreated',
  'whenchanged',
  'usncreated',
  'usnchanged',
  'samaccounttype',
  'primarygroupid',
  'canonicalname',
  'memberof',
  'useraccountcontrol',
  'pwdlastset',
  'lockouttime',
]);

export function isProtectedAttribute(name: string): boolean {
  return PROTECTED_ATTRIBUTES.has(name.trim().toLowerCase());
}

export interface AttributeRow {
  /** Display label. */
  name: string;
  /** Real LDAP attribute name used for edits. */
  attribute: string;
  values: string[];
  /** False when the directory did not return the attribute at all. */
  available: boolean;
}

export interface UserSections {
  identity: AttributeRow[];
  account: AttributeRow[];
  normalized: AttributeRow[];
  additional: AttributeRow[];
}

function row(name: string, attribute: string, value: string | string[] | undefined): AttributeRow {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return { name, attribute, values, available: values.length > 0 };
}

/**
 * Split a normalized user into display sections. Known fields missing from the
 * search response are marked unavailable (not readable / not set) instead of
 * being hidden, so varying directory schemas stay visible.
 */export function splitUserAttributes(user: DirectoryUser): UserSections {
  return {
    identity: [
      row('Distinguished name', 'distinguishedName', user.dn),
      row('sAMAccountName', 'sAMAccountName', user.sAMAccountName),
      row('User principal name', 'userPrincipalName', user.userPrincipalName),
    ],
    account: [
      {
        name: 'Account state',
        attribute: 'userAccountControl',
        values: [user.enabled === undefined ? 'Unknown' : user.enabled ? 'Enabled' : 'Disabled'],
        available: user.enabled !== undefined,
      },
    ],
    normalized: [
      row('Display name', 'displayName', user.displayName),
      row('Given name', 'givenName', user.givenName),
      row('Surname', 'sn', user.surname),
      row('Mail', 'mail', user.mail),
    ],
    additional: Object.entries(user.additionalAttributes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, values]) => ({ name, attribute: name, values, available: true })),
  };
}

const KNOWN_FIELD_MAP: Record<string, 'sAMAccountName' | 'userPrincipalName' | 'displayName' | 'givenName' | 'surname' | 'mail'> = {
  samaccountname: 'sAMAccountName',
  userprincipalname: 'userPrincipalName',
  displayname: 'displayName',
  givenname: 'givenName',
  sn: 'surname',
  mail: 'mail',
};

/**
 * Apply a verified attribute replacement to a cached user so the UI reflects
 * the authoritative values returned by the server after modification.
 */
export function applyAttributeEdit(
  user: DirectoryUser,
  attribute: string,
  values: string[],
): DirectoryUser {
  const field = KNOWN_FIELD_MAP[attribute.trim().toLowerCase()];
  if (field) return { ...user, [field]: values[0] };
  const existingKey = Object.keys(user.additionalAttributes).find(
    (k) => k.toLowerCase() === attribute.trim().toLowerCase(),
  );
  const key = existingKey ?? attribute.trim();
  return { ...user, additionalAttributes: { ...user.additionalAttributes, [key]: values } };
}
