import { NextRequest, NextResponse } from 'next/server';
import { LDAPService } from '@/lib/ldap/service';
import { validateProfile } from '@/lib/ldap/escape';
import { validateAttributeEdit } from '@/lib/ldap/mutations';
import { auditLog } from '@/lib/audit';
import type { ConnectionProfile } from '@/types';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const profile: ConnectionProfile = {
    id: typeof body.id === 'string' ? body.id.slice(0, 100) : 'unsaved',
    displayName: typeof body.displayName === 'string' ? body.displayName.slice(0, 100) : '',
    host: typeof body.host === 'string' ? body.host.trim().slice(0, 253) : '',
    port: Number.isInteger(body.port) ? (body.port as number) : 636,
    bindUser: typeof body.bindUser === 'string' ? body.bindUser.slice(0, 512) : '',
    bindPassword: typeof body.bindPassword === 'string' ? body.bindPassword : '',
    baseDN: typeof body.baseDN === 'string' ? body.baseDN.slice(0, 1024) : undefined,
    certValidation: body.certValidation !== false && body.allowInsecure !== true,
    allowInsecure: body.allowInsecure === true,
    connectTimeout: Number.isInteger(body.connectTimeout) ? (body.connectTimeout as number) : 8000,
    searchTimeout: Number.isInteger(body.searchTimeout) ? (body.searchTimeout as number) : 8000,
  };

  const profileErrors = validateProfile(profile);
  if (profileErrors.length > 0 || !profile.bindPassword) {
    return NextResponse.json(
      { error: profileErrors[0]?.message ?? 'Bind password is required.' },
      { status: 400 },
    );
  }

  const dn = typeof body.dn === 'string' ? body.dn : '';
  const attribute = typeof body.attribute === 'string' ? body.attribute : '';
  const values = Array.isArray(body.values)
    ? body.values.filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 4096))
    : [];

  const inputError = validateAttributeEdit({ dn, attribute, values });
  if (inputError) {
    return NextResponse.json({ error: inputError }, { status: 400 });
  }

  try {
    const service = new LDAPService();
    const result = await service.replaceUserAttribute(profile, { dn, attribute, values });

    auditLog({
      action: 'update-attribute',
      profileId: profile.id,
      profileName: profile.displayName,
      outcome: 'success',
      // Attribute name and value count only; values may be sensitive.
      detail: `${result.attribute} on ${result.dn} (${result.values.length} values)`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Attribute update failed.';
    auditLog({
      action: 'update-attribute',
      profileId: profile.id,
      profileName: profile.displayName,
      outcome: 'failure',
      detail: `${attribute} on ${dn}: ${message}`,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
