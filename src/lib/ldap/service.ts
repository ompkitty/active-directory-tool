import { LDAPClient } from './client';
import { validateProfile } from './escape';
import { searchUsers as runUserSearch, type UserSearchResult } from './users';
import {
  createUser as runCreateUser,
  replaceAttribute as runAttributeReplace,
  setAccountEnabled as runSetAccountEnabled,
  type AccountStateResult,
  type AttributeEditInput,
  type AttributeEditResult,
  type CreateUserInput,
  type CreateUserResult,
} from './mutations';
import type { ConnectionProfile, ConnectionTestResult } from '@/types';

export class LDAPService {
  async testConnection(profile: ConnectionProfile): Promise<ConnectionTestResult> {
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      return {
        success: false,
        diagnostics: {
          network: false,
          tlsHandshake: false,
          certValidation: false,
          ldap: false,
          rootDSE: false,
          bind: false,
          discovery: false,
        },
        failedStage: 'network',
        error: errors[0].message,
      };
    }
    if (!profile.bindPassword) {
      return {
        success: false,
        diagnostics: {
          network: false,
          tlsHandshake: false,
          certValidation: false,
          ldap: false,
          rootDSE: false,
          bind: false,
          discovery: false,
        },
        failedStage: 'bind',
        error: 'Bind password is required.',
      };
    }

    const client = new LDAPClient();
    const result = await client.testConnection(profile);
    return {
      success: !result.failedStage,
      diagnostics: result.diagnostics,
      failedStage: result.failedStage,
      error: result.message,
      metadata: result.metadata,
    };
  }

  async searchUsers(profile: ConnectionProfile, query: string, limit: number): Promise<UserSearchResult> {
    return runUserSearch(profile, query, limit);
  }

  async replaceUserAttribute(
    profile: ConnectionProfile,
    input: AttributeEditInput,
  ): Promise<AttributeEditResult> {
    return runAttributeReplace(profile, input);
  }

  async setAccountEnabled(
    profile: ConnectionProfile,
    dn: string,
    enabled: boolean,
  ): Promise<AccountStateResult> {
    return runSetAccountEnabled(profile, dn, enabled);
  }

  async createUser(profile: ConnectionProfile, input: CreateUserInput): Promise<CreateUserResult> {
    return runCreateUser(profile, input);
  }
}
