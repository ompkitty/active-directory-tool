import { LDAPClient } from './client';
import { validateProfile } from './escape';
import { searchUsers as runUserSearch, listContainers as runListContainers, type UserSearchResult, type DirectoryContainer } from './users';
import { discoverDirectory as runDiscovery, type DiscoveryReport } from './discovery';
import {
  createUser as runCreateUser,
  deleteUser as runDeleteUser,
  moveUser as runMoveUser,
  replaceAttribute as runAttributeReplace,
  resetPassword as runResetPassword,
  setAccountEnabled as runSetAccountEnabled,
  type AccountStateResult,
  type AttributeEditInput,
  type AttributeEditResult,
  type CreateUserInput,
  type CreateUserResult,
  type DeleteUserResult,
  type MoveUserResult,
  type PasswordResetInput,
  type PasswordResetResult,
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

  async listContainers(
    profile: ConnectionProfile,
  ): Promise<{ containers: DirectoryContainer[]; baseDN: string }> {
    return runListContainers(profile);
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

  async resetPassword(
    profile: ConnectionProfile,
    input: PasswordResetInput,
  ): Promise<PasswordResetResult> {
    return runResetPassword(profile, input);
  }

  async deleteUser(profile: ConnectionProfile, dn: string): Promise<DeleteUserResult> {
    return runDeleteUser(profile, dn);
  }

  async moveUser(profile: ConnectionProfile, dn: string, newParentDN: string): Promise<MoveUserResult> {
    return runMoveUser(profile, dn, newParentDN);
  }

  async discoverDirectory(profile: ConnectionProfile): Promise<DiscoveryReport> {
    return runDiscovery(profile);
  }
}
