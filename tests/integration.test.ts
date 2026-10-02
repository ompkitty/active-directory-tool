import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setTransportFactory } from '@/lib/ldap/client';
import { LDAPService } from '@/lib/ldap/service';
import { discoverDirectory } from '@/lib/ldap/discovery';
import type { ConnectionProfile } from '@/types';
import { FakeDirectory, LAB_USER } from './fake-directory';

const profile: ConnectionProfile = {
  id: 'test',
  displayName: 'Lab',
  host: 'dc01.lab1.local',
  port: 636,
  bindUser: 'ad-writer@lab1.local',
  bindPassword: 'Lab1passwd.',
  certValidation: true,
};

let directory: FakeDirectory;
let restore: () => void;

beforeEach(() => {
  directory = new FakeDirectory();
  restore = setTransportFactory(() => directory as unknown as never);
});

afterEach(() => restore());

describe('LDAPS integration path (in-memory directory)', () => {
  it('reads RootDSE and reports staged diagnostics', async () => {
    const result = await new LDAPService().testConnection(profile);
    expect(result.success).toBe(true);
    expect(result.diagnostics.rootDSE).toBe(true);
    expect(result.diagnostics.discovery).toBe(true);
    expect(result.metadata?.defaultNamingContext).toBe('DC=lab1,DC=local');
    expect(result.metadata?.effectiveBaseDN).toBe('DC=lab1,DC=local');
  });

  it('reports invalid credentials without leaking the error', async () => {
    const result = await new LDAPService().testConnection({
      ...profile,
      bindPassword: 'wrong',
    });
    expect(result.success).toBe(false);
    expect(result.failedStage).toBe('bind');
    expect(result.error).toBe('Bind failed: invalid credentials.');
  });

  it('searches users and normalizes custom attributes', async () => {
    const result = await new LDAPService().searchUsers(profile, 'alice', 10);
    expect(result.count).toBe(1);
    const user = result.users[0];
    expect(user.sAMAccountName).toBe('a.example');
    expect(user.telephoneNumber).toBe('+49 555 0100');
    expect(user.enabled).toBe(true);
    // objectGUID arrives as a Buffer and must be preserved, not dropped.
    expect(user.additionalAttributes['objectguid']).toHaveLength(1);
    expect(user.additionalAttributes['description']).toEqual(['Lab test user']);
  });

  it('escapes search input so injection attempts stay inert', async () => {
    const result = await new LDAPService().searchUsers(profile, '*)(objectClass=*', 10);
    expect(result.count).toBe(0);
  });

  it('lists OU containers for create targets', async () => {
    const result = await new LDAPService().listContainers(profile);
    expect(result.containers.map((c) => c.name)).toContain('IT');
    expect(result.containers.map((c) => c.dn)).toContain('OU=IT,OU=Benutzer,DC=lab1,DC=local');
  });

  it('discovers schema attributes from the schema NC, not CN=Subschema', async () => {
    const report = await discoverDirectory(profile);
    const attributes = report.metadata.attributes ?? [];
    expect(attributes.length).toBeGreaterThan(0);
    expect(attributes).toContain('cn');
    expect(attributes).toContain('sAMAccountName');
    expect(attributes).toContain('unicodePwd');
    expect(report.metadata.schemaAttributeCount).toBe(15);
  });

  it('excludes DNS zone contexts from domain naming contexts', async () => {
    const report = await discoverDirectory(profile);
    // RootDSE advertises the DNS zones; they must not be read as domains.
    expect(report.metadata.namingContexts).toContain('DC=DomainDnsZones,DC=lab1,DC=local');
    // AD leaves dnsForestRoot empty on this lab, so it must stay undefined.
    expect(report.metadata.dnsForestRoot).toBeUndefined();
    // The domain root carries no dnsHostName in AD; that is expected, not a fault.
    expect(report.notes.filter((n) => /domain DNS host/i.test(n))).toHaveLength(1);
    // Nothing should degrade the schema path.
    expect(report.notes.filter((n) => /schema/i.test(n))).toEqual([]);
  });

  it('derives capabilities from the full attribute set', async () => {
    const report = await discoverDirectory(profile);
    const caps = report.metadata.capabilities ?? {};
    expect(caps.userSearch).toBe(true);
    expect(caps.userCreate).toBe(true);
    expect(caps.passwordSet).toBe(true);
    expect(caps.schemaVisible).toBe(true);
    expect(caps.functionalLevels).toBe(true);
  });

  it('replaces a single attribute and verifies by re-reading', async () => {
    const result = await new LDAPService().replaceUserAttribute(profile, {
      dn: LAB_USER.dn,
      attribute: 'description',
      values: ['Updated description'],
    });
    expect(result.values).toEqual(['Updated description']);
    expect(directory.get(LAB_USER.dn)?.description).toEqual(['Updated description']);
  });

  it('toggles account state by flipping only the disable bit', async () => {
    const disabled = await new LDAPService().setAccountEnabled(profile, LAB_USER.dn, false);
    expect(disabled.enabled).toBe(false);
    expect(disabled.userAccountControl).toBe(514);

    const enabled = await new LDAPService().setAccountEnabled(profile, LAB_USER.dn, true);
    expect(enabled.enabled).toBe(true);
    expect(enabled.userAccountControl).toBe(512);
  });

  it('moves a user while preserving the RDN', async () => {
    const result = await new LDAPService().moveUser(
      profile,
      LAB_USER.dn,
      'OU=Benutzer,DC=lab1,DC=local',
    );
    expect(result.newDN).toBe('CN=Alice Example,OU=Benutzer,DC=lab1,DC=local');
    expect(directory.get(result.newDN)).toBeDefined();
    expect(directory.get(LAB_USER.dn)).toBeUndefined();
  });

  it('deletes a user and treats NO_OBJECT on re-read as success', async () => {
    const result = await new LDAPService().deleteUser(profile, LAB_USER.dn);
    expect(result.deleted).toBe(true);
    expect(directory.get(LAB_USER.dn)).toBeUndefined();
  });

  it('refuses to delete a non-user object', async () => {
    await expect(
      new LDAPService().deleteUser(profile, 'OU=IT,OU=Benutzer,DC=lab1,DC=local'),
    ).rejects.toThrow('Refusing operation: this entry is not a user object.');
  });

  it('maps insufficient rights on delete to an actionable message', async () => {
    const denier = new FakeDirectory({ denyDelete: [LAB_USER.dn] });
    const undo = setTransportFactory(() => denier as never);
    try {
      await expect(new LDAPService().deleteUser(profile, LAB_USER.dn)).rejects.toThrow(
        /Insufficient access rights/,
      );
    } finally {
      undo();
    }
  });
});
