import type { ConnectionProfile } from '@/types';

const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;

/** Escape LDAP search filter values per RFC 4515. */
export function escapeLDAPFilter(value: string): string {
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

/** Escape DN attribute values per RFC 4514 (minimal safe subset). */
export function escapeDN(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/\+/g, '\\+')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/;/g, '\\;')
    .replace(/^ /, '\\ ')
    .replace(/ $/, '\\ ');
}

export interface ProfileValidationError {
  field: string;
  message: string;
}

export function validateProfile(input: Partial<ConnectionProfile>): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];
  if (!input.displayName || input.displayName.trim().length === 0) {
    errors.push({ field: 'displayName', message: 'Display name is required.' });
  } else if (input.displayName.length > 100) {
    errors.push({ field: 'displayName', message: 'Display name must be 100 characters or fewer.' });
  }
  if (!input.host || input.host.trim().length === 0) {
    errors.push({ field: 'host', message: 'Hostname or IP address is required.' });
  } else if (input.host.length > 253 || !HOST_RE.test(input.host.trim())) {
    // Allow IPs implicitly by length check; strict FQDN preferred per docs.
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(input.host.trim())) {
      errors.push({ field: 'host', message: 'Provide a valid FQDN (preferred) or IP address.' });
    }
  }
  const port = input.port ?? 636;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push({ field: 'port', message: 'Port must be an integer between 1 and 65535.' });
  }
  if (!input.bindUser || input.bindUser.trim().length === 0) {
    errors.push({ field: 'bindUser', message: 'Bind identity is required.' });
  } else if (input.bindUser.length > 512) {
    errors.push({ field: 'bindUser', message: 'Bind identity is too long.' });
  }
  if (input.bindPassword !== undefined && input.bindPassword.length > 512) {
    errors.push({ field: 'bindPassword', message: 'Bind password is too long.' });
  }
  if (input.baseDN !== undefined && input.baseDN !== '' && input.baseDN.length > 1024) {
    errors.push({ field: 'baseDN', message: 'Base DN override is too long.' });
  }
  const connectTimeout = input.connectTimeout ?? 8000;
  if (!Number.isInteger(connectTimeout) || connectTimeout < 1000 || connectTimeout > 60000) {
    errors.push({ field: 'connectTimeout', message: 'Connection timeout must be 1000-60000 ms.' });
  }
  const searchTimeout = input.searchTimeout ?? 8000;
  if (!Number.isInteger(searchTimeout) || searchTimeout < 1000 || searchTimeout > 60000) {
    errors.push({ field: 'searchTimeout', message: 'Search timeout must be 1000-60000 ms.' });
  }
  return errors;
}

/** Build a normalized ldaps:// URL. Only LDAPS is supported. */
export function buildLdapsUrl(host: string, port: number): string {
  return `ldaps://${host.trim()}:${port || 636}`;
}
