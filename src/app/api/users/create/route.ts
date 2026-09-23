import { NextRequest, NextResponse } from 'next/server';
import { LDAPService } from '@/lib/ldap/service';
import { validateProfile } from '@/lib/ldap/escape';
import { validateCreateUserInput } from '@/lib/ldap/mutations';
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

  const input = {
    parentDN: typeof body.parentDN === 'string' ? body.parentDN : '',
    sAMAccountName: typeof body.sAMAccountName === 'string' ? body.sAMAccountName : '',
    givenName: typeof body.givenName === 'string' ? body.givenName : '',
    surname: typeof body.surname === 'string' ? body.surname : '',
    displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
    userPrincipalName: typeof body.userPrincipalName === 'string' ? body.userPrincipalName : undefined,
    password: typeof body.password === 'string' ? body.password : '',
    enableAfterCreate: body.enableAfterCreate !== false,
  };

  const inputError = validateCreateUserInput(input);
  if (inputError) {
    return NextResponse.json({ error: inputError }, { status: 400 });
  }

  try {
    const service = new LDAPService();
    const result = await service.createUser(profile, input);

    // The entry itself was created; warnings flag unfinished follow-up steps.
    // Never log passwords or password content.
    auditLog({
      action: 'create-user',
      profileId: profile.id,
      profileName: profile.displayName,
      outcome: 'success',
      detail: `${result.dn} (passwordSet=${result.passwordSet}, enabled=${result.enabled})${result.warning ? ` WARNING: ${result.warning}` : ''}`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'User creation failed.';
    auditLog({
      action: 'create-user',
      profileId: profile.id,
      profileName: profile.displayName,
      outcome: 'failure',
      detail: message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
