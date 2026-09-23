/**
 * Shared domain types. No secrets are persisted in plaintext by design;
 * bind passwords only travel server-side per request and are never stored
 * in localStorage, URLs, or logs (see docs/security.md).
 */

export interface ConnectionProfile {
  id: string;
  displayName: string;
  /** FQDN preferred so certificate hostname validation works. */
  host: string;
  /** LDAPS port. Default 636. Custom value only for non-standard LDAPS. */
  port: number;
  /** Bind identity (UPN, DN, or DOMAIN\sAMAccountName as supported by the target). */
  bindUser: string;
  /** Supplied per request, server-side only. Never persisted. */
  bindPassword?: string;
  /** Optional override when automatic discovery cannot determine the base DN. */
  baseDN?: string;
  /** TLS certificate validation. Always true unless explicitly overridden for lab troubleshooting. */
  certValidation: boolean;
  /**
   * Lab/troubleshooting-only bypass for certificate validation.
   * Explicitly labeled unsafe in the UI and never the default.
   */
  allowInsecure?: boolean;
  /** Connection timeout in ms. */
  connectTimeout?: number;
  /** Search timeout in ms. */
  searchTimeout?: number;
  active?: boolean;
}

/** Persisted (non-secret) subset stored client-side for the MVP. */
export type PersistedProfile = Omit<ConnectionProfile, 'bindPassword'>;

export interface DiscoveredMetadata {
  defaultNamingContext?: string;
  namingContexts?: string[];
  dnsHostName?: string;
  domainFunctionality?: string;
  forestFunctionality?: string;
  schemaNamingContext?: string;
  /** Base DN actually used (discovered or override). */
  effectiveBaseDN?: string;
}

export type DiagnosticStage =
  | 'network'
  | 'tlsHandshake'
  | 'certValidation'
  | 'ldap'
  | 'rootDSE'
  | 'bind'
  | 'discovery';

export type Diagnostics = Record<DiagnosticStage, boolean>;

export interface ConnectionTestResult {
  success: boolean;
  diagnostics: Diagnostics;
  /** Short, actionable message safe for UI display. No secrets or raw internals. */
  error?: string;
  /** Machine-readable stage where a failure occurred. */
  failedStage?: DiagnosticStage;
  metadata?: DiscoveredMetadata;
}

/** Normalized user with room for unknown/custom attributes. */
export interface DirectoryUser {
  dn: string;
  sAMAccountName?: string;
  userPrincipalName?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  enabled?: boolean;
  /** Attributes not in the normalized mapping. Never dropped. */
  additionalAttributes: Record<string, string[]>;
}

export interface AuditEvent {
  timestamp: string;
  action: string;
  /** Profile id the event belongs to. Never mix audit records across profiles. */
  profileId: string;
  profileName?: string;
  outcome: 'success' | 'failure';
  detail?: string;
}
