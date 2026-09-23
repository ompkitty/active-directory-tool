import { LDAPClient, toSafeError } from './client';
import { validateProfile } from './escape';
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
