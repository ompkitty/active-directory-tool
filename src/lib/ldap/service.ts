import { LDAPClient } from './client';
import { ConnectionProfile, ConnectionTestResult } from '@/types';

export class LDAPService {
  async testConnection(profile: ConnectionProfile): Promise<ConnectionTestResult> {
    const result: ConnectionTestResult = {
      success: false,
      diagnostics: {
        network: false,
        tlsHandshake: false,
        certValidation: false,
        ldap: false,
        bind: false,
        rootDSE: false,
      },
    };

    const client = new LDAPClient();

    try {
      await client.connect(profile);
      result.diagnostics.network = true;
      result.diagnostics.tlsHandshake = true;
      result.diagnostics.certValidation = true;

      await client.bind(profile);
      result.diagnostics.ldap = true;
      result.diagnostics.bind = true;

      const metadata = await client.getRootDSE();
      result.diagnostics.rootDSE = true;
      result.metadata = metadata;
      result.success = true;
    } catch (err: any) {
      result.error = err.message;
    } finally {
      await client.disconnect();
    }

    return result;
  }
}
