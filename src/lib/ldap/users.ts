import type { Entry } from 'ldapts';
import { LDAPClient, toSafeError } from './client';
import { escapeLDAPFilter, validateProfile } from './escape';
import type { ConnectionProfile, DirectoryUser } from '@/types';

export const USER_SEARCH_LIMIT_DEFAULT = 50;
export const USER_SEARCH_LIMIT_MAX = 200;

/** Normalized attribute names; everything else lands in additionalAttributes. */
const KNOWN_ATTRIBUTES = new Set([
  'samaccountname',
  'userprincipalname',
  'displayname',
  'givenname',
  'sn',
  'mail',
  'useraccountcontrol',
  'cn',
]);

/**
 * Build an AD user search filter. All user input is escaped per RFC 4515;
 * the query only ever lands inside fixed match templates.
 */
export function buildUserSearchFilter(query: string): string {
  const q = query.trim();
  if (!q) return '(&(objectCategory=person)(objectClass=user))';
  const escaped = escapeLDAPFilter(q);
  return (
    '(&(objectCategory=person)(objectClass=user)' +
    `(|(sAMAccountName=*${escaped}*)(cn=*${escaped}*)(displayName=*${escaped}*)` +
    `(userPrincipalName=*${escaped}*)(mail=*${escaped}*)))`
  );
}

function attrStrings(value: Buffer | Buffer[] | string[] | string | undefined): string[] {
  if (value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Buffer.isBuffer(value)) return [value.toString('base64')];
  return value.map((v) => (Buffer.isBuffer(v) ? v.toString('base64') : v));
}

function first(values: string[]): string | undefined {
  return values.length > 0 ? values[0] : undefined;
}

/**
 * Normalize one LDAP entry. Known identity/account attributes map to friendly
 * fields; every other returned attribute is preserved in additionalAttributes
 * so directory-specific schema extensions are never dropped.
 */
export function normalizeUser(entry: Entry): DirectoryUser {
  const byName = new Map<string, string[]>();
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'dn') continue;
    byName.set(key.toLowerCase(), attrStrings(value as Buffer | Buffer[] | string[] | string));
  }

  const uac = first(byName.get('useraccountcontrol') ?? []);
  const uacFlags = uac !== undefined && /^\d+$/.test(uac) ? parseInt(uac, 10) : null;

  const additionalAttributes: Record<string, string[]> = {};
  for (const [key, values] of byName) {
    if (!KNOWN_ATTRIBUTES.has(key)) additionalAttributes[key] = values;
  }

  return {
    dn: entry.dn,
    sAMAccountName: first(byName.get('samaccountname') ?? []),
    userPrincipalName: first(byName.get('userprincipalname') ?? []),
    displayName: first(byName.get('displayname') ?? []),
    givenName: first(byName.get('givenname') ?? []),
    surname: first(byName.get('sn') ?? []),
    mail: first(byName.get('mail') ?? []),
    // userAccountControl bit 0x2 (ACCOUNTDISABLE), see MS-SAMR / MS-ADTS.
    enabled: uacFlags === null ? undefined : (uacFlags & 0x2) === 0,
    additionalAttributes,
  };
}

export interface UserSearchResult {
  users: DirectoryUser[];
  baseDN: string;
  count: number;
}

export async function searchUsers(
  profile: ConnectionProfile,
  query: string,
  limit: number,
): Promise<UserSearchResult> {
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new Error(errors[0].message);
  if (!profile.bindPassword) throw new Error('Bind password is required.');
  if (query.length > 200) throw new Error('Search query must be 200 characters or fewer.');
  if (!Number.isInteger(limit) || limit < 1 || limit > USER_SEARCH_LIMIT_MAX) {
    throw new Error(`Limit must be an integer between 1 and ${USER_SEARCH_LIMIT_MAX}.`);
  }

  const client = new LDAPClient();
  try {
    // '*' requests all user attributes so custom schema extensions are included.
    const { entries, baseDN } = await client.searchSubtree(profile, {
      filter: buildUserSearchFilter(query),
      attributes: ['*'],
      limit,
    });
    const users = entries.map(normalizeUser);
    return { users, baseDN, count: users.length };
  } catch (err) {
    throw new Error(toSafeError(err).message);
  }
}
