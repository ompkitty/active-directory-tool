import ldap from 'ldapjs';
import { ConnectionProfile, DiscoveredMetadata } from '@/types';

export class LDAPClient {
  private client: ldap.Client | null = null;

  async connect(profile: ConnectionProfile): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const url = `ldaps://${profile.host}:${profile.port || 636}`;
      
      this.client = ldap.createClient({
        url,
        tlsOptions: {
          rejectUnauthorized: profile.certValidation !== false,
        },
        timeout: 5000,
      });

      this.client.on('error', (err) => {
        reject(err);
      });

      this.client.on('connect', () => {
        resolve(true);
      });
    });
  }

  async bind(profile: ConnectionProfile): Promise<boolean> {
    if (!this.client) throw new Error('Not connected');
    
    return new Promise((resolve, reject) => {
      this.client!.bind(profile.bindUser, profile.bindPassword || '', (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  async getRootDSE(): Promise<DiscoveredMetadata> {
    if (!this.client) throw new Error('Not bound');
    
    return new Promise((resolve, reject) => {
      this.client!.search('', {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: ['defaultNamingContext', 'namingContexts', 'dnsHostName', 'domainControllerFunctionality'],
      }, (err, res) => {
        if (err) return reject(err);
        
        const metadata: DiscoveredMetadata = {};
        res.on('searchEntry', (entry) => {
          const obj = entry.object;
          metadata.defaultNamingContext = obj.defaultNamingContext?.[0];
          metadata.namingContexts = obj.namingContexts;
          metadata.domainController = obj.dnsHostName?.[0];
        });
        
        res.on('end', () => resolve(metadata));
        res.on('error', reject);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.unbind();
      this.client = null;
    }
  }
}
