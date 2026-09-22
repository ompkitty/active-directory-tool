export interface ConnectionProfile {
  id: string;
  displayName: string;
  host: string;
  port: number;
  bindUser: string;
  bindPassword?: string;
  baseDN?: string;
  certValidation: boolean;
  active?: boolean;
}

export interface DiscoveredMetadata {
  defaultNamingContext?: string;
  namingContexts?: string[];
  domainController?: string;
  dnsHostName?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  diagnostics: {
    network: boolean;
    tlsHandshake: boolean;
    certValidation: boolean;
    ldap: boolean;
    bind: boolean;
    rootDSE: boolean;
  };
  error?: string;
  metadata?: DiscoveredMetadata;
}
