import type { AuditEvent } from '@/types';

/**
 * Minimal server-side audit helper. Logs structured events without secrets.
 * Passwords, tokens, and raw LDAP errors must never reach this log.
 */
export function auditLog(event: Omit<AuditEvent, 'timestamp'>): void {
  const entry: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  // JSON line to stdout; redaction is enforced by callers.
  console.log(JSON.stringify({ source: 'ad-tool-audit', ...entry }));
}
