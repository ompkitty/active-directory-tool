import type { DirectoryUser } from '@/types';

export interface AttributeRow {
  name: string;
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

function row(name: string, value: string | string[] | undefined): AttributeRow {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return { name, values, available: values.length > 0 };
}

/**
 * Split a normalized user into display sections. Known fields missing from the
 * search response are marked unavailable (not readable / not set) instead of
 * being hidden, so varying directory schemas stay visible.
 */
export function splitUserAttributes(user: DirectoryUser): UserSections {
  return {
    identity: [
      row('Distinguished name', user.dn),
      row('sAMAccountName', user.sAMAccountName),
      row('User principal name', user.userPrincipalName),
    ],
    account: [
      {
        name: 'Account state',
        values: [user.enabled === undefined ? 'Unknown' : user.enabled ? 'Enabled' : 'Disabled'],
        available: user.enabled !== undefined,
      },
    ],
    normalized: [
      row('Display name', user.displayName),
      row('Given name', user.givenName),
      row('Surname', user.surname),
      row('Mail', user.mail),
    ],
    additional: Object.entries(user.additionalAttributes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, values]) => ({ name, values, available: true })),
  };
}
