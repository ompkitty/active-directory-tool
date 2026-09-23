'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActiveProfileBanner } from '@/components/layout/active-profile-banner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getActiveId, loadDiscovery, loadProfiles } from '@/lib/profiles';
import type { DiscoveredMetadata, PersistedProfile } from '@/types';

const MOCK_USERS = [
  { name: 'A. Example', upn: 'a.example@example.invalid', state: 'Enabled' },
  { name: 'B. Example', upn: 'b.example@example.invalid', state: 'Disabled' },
];

export default function HomePage() {
  const [profile] = useState<PersistedProfile | null>(() => {
    if (typeof window === 'undefined') return null;
    const profiles = loadProfiles();
    return profiles.find((p) => p.id === getActiveId()) ?? null;
  });
  const [discovery] = useState<DiscoveredMetadata | null>(() =>
    profile ? loadDiscovery(profile.id) : null,
  );

  return (
    <div>
      <ActiveProfileBanner />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Connection status and per-directory discovery for the active profile.
            </p>
          </div>
          <Link
            href="/connections"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-100"
          >
            Manage connections
          </Link>
        </div>

        {!profile ? (
          <Alert>
            No connection profile selected. Create a profile under Connections, test it over LDAPS, and
            set it active. No domain or server is hard-coded into this application.
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Active profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="font-medium">{profile.displayName}</p>
                  <p className="font-mono text-xs text-neutral-500">
                    ldaps://{profile.host}:{profile.port}
                  </p>
                  <p className="text-xs text-neutral-500">Bind: {profile.bindUser}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Connection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="text-neutral-500">Transport:</span> LDAPS only
                  </p>
                  <p>
                    <span className="text-neutral-500">Certificate validation:</span>{' '}
                    {profile.certValidation === false ? 'Bypassed (lab-only, unsafe)' : 'Required'}
                  </p>
                  <p>
                    <Badge>{discovery ? 'Discovered' : 'Not tested yet'}</Badge>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Discovery</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="text-neutral-500">Default naming context:</span>
                  </p>
                  <p className="font-mono text-xs">{discovery?.defaultNamingContext ?? '—'}</p>
                  <p>
                    <span className="text-neutral-500">Directory host:</span>{' '}
                    {discovery?.dnsHostName ?? '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Naming contexts</CardTitle>
              </CardHeader>
              <CardContent>
                {discovery?.namingContexts?.length ? (
                  <ul className="space-y-1 font-mono text-xs">
                    {discovery.namingContexts.map((nc) => (
                      <li key={nc}>• {nc}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">
                    No discovery data yet. Test the connection to populate RootDSE metadata for this
                    profile.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Users (preview)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-neutral-500">
              Mock data — UI placeholder only. Live user search per active profile is tracked in issue
              #4 and is not mixed with production directory data.
            </p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">UPN</th>
                  <th className="py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_USERS.map((u) => (
                  <tr key={u.upn} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{u.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{u.upn}</td>
                    <td className="py-2">
                      <Badge>{u.state}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
