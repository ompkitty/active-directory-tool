import { NextRequest, NextResponse } from 'next/server';
import { LDAPService } from '@/lib/ldap/service';
import { validateProfile } from '@/lib/ldap/escape';
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
  if (!dn.trim() || dn.length > 1024 || !dn.includes('=')) {
    return NextResponse.json({ error: 'Invalid entry distinguished name.' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Request must specify enabled as true or false.' }, { status: 400 });
  }
  const enabled = body.enabled;

  try {
    const service = new LDAPService();
    const result = await service.setAccountEnabled(profile, dn, enabled);

    auditLog({
      action: 'set-account-state',
      profileId: profile.id,
      profileName: profile.displayName,
      outcome: 'success',
      detail: `${result.dn} -> ${result.enabled ? 'enabled' : 'disabled'}`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Account state change failed.';
    auditLog({
      action: 'set-account-state',
      profileId: profile.id,
      profileName: profile.displayName,
      outcome: 'failure',
      detail: `${dn}: ${message}`,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
