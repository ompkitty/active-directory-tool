import { LDAPClient, toSafeError } from './client';
import { escapeDN, validateProfile } from './escape';
import { isProtectedAttribute } from '../directory-attributes';
import type { ConnectionProfile } from '@/types';

/**
 * Server-side re-export for validation; the canonical set lives in the
 * client-safe directory-attributes module.
 */
export { isProtectedAttribute };

const ATTRIBUTE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export interface AttributeEditInput {
  dn: string;
  attribute: string;
  values: string[];
}

/** Validate without touching the directory. Returns a UI-safe message or null. */
export function validateAttributeEdit(input: AttributeEditInput): string | null {
  const dn = input.dn.trim();
  if (!dn || dn.length > 1024 || !dn.includes('=')) {
    return 'Invalid entry distinguished name.';
  }
  const attribute = input.attribute.trim();
  if (!attribute || attribute.length > 64 || !ATTRIBUTE_NAME_RE.test(attribute)) {
    return 'Invalid attribute name.';
  }
  if (isProtectedAttribute(attribute)) {
    return `'${attribute}' is system-managed and cannot be edited here.`;
  }
  if (!Array.isArray(input.values) || input.values.length === 0 || input.values.length > 50) {
    return 'Provide between 1 and 50 values.';
  }
  for (const v of input.values) {
    if (typeof v !== 'string' || v.length === 0 || v.length > 4096) {
      return 'Each value must be 1-4096 characters. Deleting an attribute is not supported yet.';
    }
  }
  return null;
}

export interface AttributeEditResult {
  dn: string;
  attribute: string;
  values: string[];
}

/** userAccountControl ACCOUNTDISABLE bit (MS-SAMR). */
const ACCOUNTDISABLE = 0x2;

export function isAccountEnabledFlags(flags: number): boolean {
  return (flags & ACCOUNTDISABLE) === 0;
}

/** Set or clear ACCOUNTDISABLE while preserving all other flags. */
export function withAccountEnabled(flags: number, enabled: boolean): number {
  return enabled ? flags & ~ACCOUNTDISABLE : flags | ACCOUNTDISABLE;
}

export interface AccountStateResult {
  dn: string;
  enabled: boolean;
  userAccountControl: number;
}

/**
 * Encode a password for the unicodePwd attribute: quoted UTF-16LE.
 * Never logged or persisted; used once per request.
 */
export function encodePassword(password: string): Buffer {
  return Buffer.from(`"${password}"`, 'utf16le');
}

const SAMACCOUNTNAME_RE = /^[a-zA-Z0-9._-]{1,20}$/;

export interface CreateUserInput {
  parentDN: string;
  sAMAccountName: string;
  givenName: string;
  surname: string;
  displayName?: string;
  userPrincipalName?: string;
  password: string;
  enableAfterCreate: boolean;
}

export function defaultDisplayName(givenName: string, surname: string): string {
  return `${givenName.trim()} ${surname.trim()}`;
}

/** Validate without touching the directory. Returns a UI-safe message or null. */
export function validateCreateUserInput(input: CreateUserInput): string | null {
  const parentDN = input.parentDN.trim();
  if (!parentDN || parentDN.length > 1024 || !parentDN.includes('=')) {
    return 'Target container DN is invalid. Run a connection test to discover the base DN first.';
  }
  if (!SAMACCOUNTNAME_RE.test(input.sAMAccountName.trim())) {
    return 'Account name must be 1-20 characters (letters, digits, dot, underscore, hyphen).';
  }
  for (const [label, value, max] of [
    ['First name', input.givenName, 64],
    ['Last name', input.surname, 64],
  ] as const) {
    if (!value.trim() || value.trim().length > max) {
      return `${label} is required (max ${max} characters).`;
    }
  }
  if (input.displayName !== undefined && (input.displayName.trim().length === 0 || input.displayName.length > 256)) {
    return 'Display name must be 1-256 characters.';
  }
  if (input.userPrincipalName !== undefined && input.userPrincipalName !== '') {
    const upn = input.userPrincipalName.trim();
    if (upn.length > 512 || !upn.includes('@')) {
      return 'User principal name must look like user@domain.';
    }
  }
  if (input.password.length < 8 || input.password.length > 256) {
    return 'Password must be 8-256 characters. The domain may enforce additional complexity.';
  }
  return null;
}

export interface CreateUserResult {
  dn: string;
  passwordSet: boolean;
  enabled: boolean;
  /** Set when later steps failed after the entry was created. */
  warning?: string;
}

/**
 * Create a user disabled, set the initial password (unicodePwd over LDAPS),
 * then enable unless disabled was requested. Later-step failures return a
 * warning with the created DN so an admin can finish manually — nothing is
 * retried automatically.
 */
export async function createUser(
  profile: ConnectionProfile,
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const profileErrors = validateProfile(profile);
  if (profileErrors.length > 0) throw new Error(profileErrors[0].message);
  if (!profile.bindPassword) throw new Error('Bind password is required.');
  const inputError = validateCreateUserInput(input);
  if (inputError) throw new Error(inputError);

  const displayName = input.displayName?.trim() || defaultDisplayName(input.givenName, input.surname);
  const dn = buildUserDN(displayName, input.parentDN);
  const attributes: Record<string, string | string[]> = {
    objectClass: ['top', 'person', 'organizationalPerson', 'user'],
    sAMAccountName: input.sAMAccountName.trim(),
    givenName: input.givenName.trim(),
    sn: input.surname.trim(),
    displayName,
    userAccountControl: '546',
  };
  if (input.userPrincipalName?.trim()) {
    attributes.userPrincipalName = input.userPrincipalName.trim();
  }

  const client = new LDAPClient();
  try {
    await client.addEntry(profile, dn, attributes);
  } catch (err) {
    throw new Error(mapCreateError(err));
  }

  try {
    await client.modifyBinary(profile, dn, 'unicodePwd', encodePassword(input.password));
  } catch (err) {
    return {
      dn,
      passwordSet: false,
      enabled: false,
      warning: `User created, but the password was rejected: ${mapCreateError(err)} The account stays disabled; set a compliant password manually.`,
    };
  }

  if (!input.enableAfterCreate) {
    return { dn, passwordSet: true, enabled: false };
  }
  try {
    const state = await setAccountEnabledWith(client, profile, dn, true);
    return { dn, passwordSet: true, enabled: state.enabled };
  } catch (err) {
    return {
      dn,
      passwordSet: true,
      enabled: false,
      warning: `User created with password, but enabling failed: ${mapCreateError(err)} Enable the account manually.`,
    };
  }
}

/** Build `CN=<escaped>,<parent>` without inventing DN structure. */
export function buildUserDN(displayName: string, parentDN: string): string {
  return `CN=${escapeDN(displayName.trim())},${parentDN.trim()}`;
}

function mapCreateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('already exists') || lower.includes('alreadyexists')) {
    return 'An entry with this name already exists in the target container.';
  }
  return mapModifyError(err);
}

function mapModifyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient')) {
    return 'Insufficient access rights to modify this attribute.';
  }
  if (lower.includes('no such object')) {
    return 'Entry not found. It may have been moved or deleted.';
  }
  if (lower.includes('constraint') || lower.includes('unwilling')) {
    return 'The server rejected the change (constraint violation or protected attribute).';
  }
  if (lower.includes('undefined attribute') || lower.includes('undefinedattribute')) {
    return 'Unknown attribute for this directory schema.';
  }
  return toSafeError(err).message;
}

/**
 * Replace one attribute's values (LDAP replace operation), then re-read the
 * attribute to verify and return the authoritative values.
 */
export async function replaceAttribute(
  profile: ConnectionProfile,
  input: AttributeEditInput,
): Promise<AttributeEditResult> {
  const profileErrors = validateProfile(profile);
  if (profileErrors.length > 0) throw new Error(profileErrors[0].message);
  if (!profile.bindPassword) throw new Error('Bind password is required.');
  const inputError = validateAttributeEdit(input);
  if (inputError) throw new Error(inputError);

  const dn = input.dn.trim();
  const attribute = input.attribute.trim();
  const client = new LDAPClient();
  try {
    const values = await client.modifyReplace(profile, dn, attribute, input.values);
    return { dn, attribute, values };
  } catch (err) {
    throw new Error(mapModifyError(err));
  }
}

/**
 * Enable or disable an account by flipping only the ACCOUNTDISABLE bit,
 * preserving all other userAccountControl flags. The current flags are always
 * read from the server first; the result is verified by re-reading.
 */
export async function setAccountEnabled(
  profile: ConnectionProfile,
  dn: string,
  enabled: boolean,
): Promise<AccountStateResult> {
  const profileErrors = validateProfile(profile);
  if (profileErrors.length > 0) throw new Error(profileErrors[0].message);
  if (!profile.bindPassword) throw new Error('Bind password is required.');
  return setAccountEnabledWith(new LDAPClient(), profile, dn, enabled);
}

async function setAccountEnabledWith(
  client: LDAPClient,
  profile: ConnectionProfile,
  dn: string,
  enabled: boolean,
): Promise<AccountStateResult> {
  const cleanDn = dn.trim();
  if (!cleanDn || cleanDn.length > 1024 || !cleanDn.includes('=')) {
    throw new Error('Invalid entry distinguished name.');
  }

  try {
    const current = await client.readAttribute(profile, cleanDn, 'userAccountControl');
    const currentFlags = current.length > 0 && /^\d+$/.test(current[0]) ? parseInt(current[0], 10) : null;
    if (currentFlags === null) {
      throw new Error('Current account state is not readable for this entry.');
    }
    const target = withAccountEnabled(currentFlags, enabled);
    if (target === currentFlags) {
      return { dn: cleanDn, enabled, userAccountControl: currentFlags };
    }
    const verified = await client.modifyReplace(profile, cleanDn, 'userAccountControl', [String(target)]);
    const verifiedFlags = verified.length > 0 && /^\d+$/.test(verified[0]) ? parseInt(verified[0], 10) : null;
    if (verifiedFlags === null || isAccountEnabledFlags(verifiedFlags) !== enabled) {
      throw new Error('Account state change was not confirmed by the server.');
    }
    return { dn: cleanDn, enabled, userAccountControl: verifiedFlags };
  } catch (err) {
    // Our own verification failures carry safe messages already; map the rest.
    if (
      err instanceof Error &&
      (err.message.startsWith('Current account state') ||
        err.message.startsWith('Account state change'))
    ) {
      throw err;
    }
    throw new Error(mapModifyError(err));
  }
}
