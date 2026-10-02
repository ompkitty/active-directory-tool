'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActiveProfileBanner } from '@/components/layout/active-profile-banner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getActiveId,
  getSessionPassword,
  loadDiscovery,
  loadProfiles,
  saveDiscovery,
} from '@/lib/profiles';
import type { DiscoveredMetadata, PersistedProfile } from '@/types';

const CAPABILITY_LABELS: Record<string, string> = {
  userSearch: 'User search',
  userCreate: 'User creation',
  userModify: 'User modification',
  userDelete: 'User deletion',
  passwordSet: 'Password set/reset',
  containerBrowse: 'Container browse',
  schemaVisible: 'Schema attributes',
  functionalLevels: 'Functional levels',
};

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-subtle px-3 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="col-span-2 break-all font-mono text-xs">
        {value ?? <span className="font-sans text-subtle">Not exposed by this directory</span>}
      </span>
    </div>
  );
}

export default function DirectoryPage() {
  const [profiles] = useState<PersistedProfile[]>(() =>
    typeof window === 'undefined' ? [] : loadProfiles(),
  );
  const [activeId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getActiveId(),
  );
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<DiscoveredMetadata | null>(() =>
    activeId ? loadDiscovery(activeId) : null,
  );

  const active = profiles.find((p) => p.id === activeId) ?? null;

  async function runDiscovery(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !activeId) return;
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) {
      setError('Enter the bind password (memory-only, never stored).');
      return;
    }
    setLoading(true);
    setError(null);
    setNotes([]);
    try {
      const res = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...active, bindPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Discovery failed.');
      }
      setMetadata(data.metadata as DiscoveredMetadata);
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      saveDiscovery(activeId, data.metadata as DiscoveredMetadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ActiveProfileBanner />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Directory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discovered metadata and capabilities for the active profile. Cached per profile; nothing
            is shared between directories.
          </p>
        </div>

        {!active ? (
          <Alert>
            No active profile.{' '}
            <Link href="/connections" className="underline">
              Open Connections
            </Link>{' '}
            to add an LDAPS profile and set it active.
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Run discovery on {active.displayName}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={runDiscovery} className="grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label htmlFor="discovery-password" className="mb-1 block text-xs font-medium text-foreground-muted">
                      Bind password
                    </label>
                    <input
                      id="discovery-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Required per session"
                      className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? 'Discovering…' : 'Discover'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {error ? <Alert>{error}</Alert> : null}

            {loading ? (
              <Card>
                <CardContent className="space-y-2 pt-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ) : metadata ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Directory identity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-subtle">
                      <Field label="Default naming context" value={metadata.defaultNamingContext} />
                      <Field label="Effective base DN" value={metadata.effectiveBaseDN} />
                      <Field label="Domain DNS host" value={metadata.domainDnsHostName ?? metadata.dnsHostName} />
                      <Field label="Forest root" value={metadata.dnsForestRoot} />
                      <Field label="Configuration NC" value={metadata.configurationNamingContext} />
                      <Field label="Schema NC" value={metadata.schemaNamingContext} />
                      <Field label="Domain level" value={metadata.domainFunctionality} />
                      <Field label="Forest level" value={metadata.forestFunctionality} />
                      <Field label="Discovered at" value={metadata.discoveredAt} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Naming contexts ({metadata.namingContexts?.length ?? 0})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metadata.namingContexts?.length ? (
                      <ul className="space-y-1 font-mono text-xs">
                        {metadata.namingContexts.map((nc) => (
                          <li key={nc}>{nc}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No naming contexts discovered.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Discovered attributes ({metadata.schemaAttributeCount ?? metadata.attributes?.length ?? 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {metadata.attributes?.length ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Attribute definitions read from the schema naming context. Filter to find
                          one:
                        </p>
                        <Combobox
                          ariaLabel="Attribute search"
                          options={metadata.attributes.map((a) => ({ value: a, label: a }))}
                          value=""
                          onChange={() => undefined}
                          placeholder="Filter attributes…"
                        />
                        <div className="flex flex-wrap gap-1">
                          {metadata.attributes.slice(0, 60).map((a) => (
                            <Badge key={a} className="font-mono">
                              {a}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Showing {Math.min(60, metadata.attributes.length)} of{' '}
                          {metadata.schemaAttributeCount ?? metadata.attributes.length} discovered.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Schema not readable with this bind identity — see diagnostics below.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Capabilities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
                        const on = metadata.capabilities?.[key] === true;
                        return (
                          <Badge key={key} className={on ? 'bg-strong text-inverted' : ''}>
                            {label}: {on ? 'available' : 'unavailable'}
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Derived from what this directory actually exposed, not assumed.
                    </p>
                  </CardContent>
                </Card>

                {notes.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Discovery diagnostics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-muted">
                        {notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </>
            ) : (
              <Alert>
                No discovery data for this profile yet. Run discovery to read RootDSE, domain, and
                schema metadata.
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
  );
}
