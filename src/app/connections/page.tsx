'use client';

import { useState } from 'react';
import { ActiveProfileBanner } from '@/components/layout/active-profile-banner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  clearDiscovery,
  clearSessionPassword,
  getActiveId,
  getSessionPassword,
  loadDiscovery,
  loadProfiles,
  saveDiscovery,
  saveProfiles,
  setActiveId,
  setSessionPassword,
} from '@/lib/profiles';
import type { ConnectionTestResult, Diagnostics, PersistedProfile } from '@/types';

const STAGES: { key: keyof Diagnostics; label: string }[] = [
  { key: 'network', label: 'Network' },
  { key: 'tlsHandshake', label: 'TLS handshake' },
  { key: 'certValidation', label: 'Certificate validation' },
  { key: 'ldap', label: 'LDAP' },
  { key: 'rootDSE', label: 'RootDSE' },
  { key: 'bind', label: 'Bind' },
  { key: 'discovery', label: 'Discovery' },
];

interface FormState {
  displayName: string;
  host: string;
  port: string;
  bindUser: string;
  bindPassword: string;
  baseDN: string;
  requireCertValidation: boolean;
  allowInsecure: boolean;
}

const EMPTY_FORM: FormState = {
  displayName: '',
  host: '',
  port: '636',
  bindUser: '',
  bindPassword: '',
  baseDN: '',
  requireCertValidation: true,
  allowInsecure: false,
};

export default function ConnectionsPage() {
  const [profiles, setProfiles] = useState<PersistedProfile[]>(() =>
    typeof window === 'undefined' ? [] : loadProfiles(),
  );
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getActiveId(),
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ConnectionTestResult>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function persist(next: PersistedProfile[]) {
    setProfiles(next);
    saveProfiles(next);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const port = parseInt(form.port, 10);
    if (!form.displayName.trim() || !form.host.trim() || !form.bindUser.trim() || !form.bindPassword) {
      setFormError('Display name, host, bind identity, and bind password are required.');
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setFormError('Port must be an integer between 1 and 65535.');
      return;
    }
    const id = `profile-${Date.now()}`;
    const next: PersistedProfile = {
      id,
      displayName: form.displayName.trim(),
      host: form.host.trim(),
      port,
      bindUser: form.bindUser.trim(),
      baseDN: form.baseDN.trim() || undefined,
      certValidation: form.requireCertValidation && !form.allowInsecure,
      allowInsecure: form.allowInsecure,
      connectTimeout: 8000,
      searchTimeout: 8000,
      active: profiles.length === 0,
    };
    // Password lives in memory only, never in localStorage.
    setSessionPassword(id, form.bindPassword);
    const updated = [...profiles, next];
    persist(updated);
    if (profiles.length === 0) setActiveIdState(id);
    if (next.active) setActiveId(id);
    setForm(EMPTY_FORM);
  }

  async function handleTest(profile: PersistedProfile, passwordOverride?: string) {
    const password = passwordOverride ?? getSessionPassword(profile.id) ?? '';
    if (!password) {
      setResults((r) => ({
        ...r,
        [profile.id]: {
          success: false,
          diagnostics: emptyDiag(),
          failedStage: 'bind',
          error: 'Enter the bind password again (passwords are kept in memory only and never stored).',
        },
      }));
      return;
    }
    setTestingId(profile.id);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...profile, bindPassword: password }),
      });
      const data = (await res.json()) as ConnectionTestResult;
      setResults((r) => ({ ...r, [profile.id]: data }));
      if (data.success && data.metadata) saveDiscovery(profile.id, data.metadata);
    } catch {
      setResults((r) => ({
        ...r,
        [profile.id]: { success: false, diagnostics: emptyDiag(), failedStage: 'network', error: 'Request failed.' },
      }));
    } finally {
      setTestingId(null);
    }
  }

  function handleActivate(id: string) {
    // Switching profiles partitions cached state: dashboard reads discovery per profile id.
    setActiveIdState(id);
    setActiveId(id);
    persist(profiles.map((p) => ({ ...p, active: p.id === id })));
  }

  function handleDelete(id: string) {
    clearDiscovery(id);
    clearSessionPassword(id);
    const next = profiles.filter((p) => p.id !== id);
    persist(next);
    if (activeId === id) {
      const fallback = next[0]?.id ?? null;
      setActiveIdState(fallback);
      setActiveId(fallback);
    }
  }

  return (
    <div>
      <ActiveProfileBanner />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Connections</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Multiple LDAPS profiles. Passwords stay in server memory per request and are never
            persisted, logged, or placed in URLs.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add profile (LDAPS only)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="host">Hostname (FQDN preferred)</Label>
                <Input id="host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="dc01.example.invalid" required />
              </div>
              <div>
                <Label htmlFor="port">Port (LDAPS, default 636)</Label>
                <Input id="port" inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="bindUser">Bind identity</Label>
                <Input id="bindUser" value={form.bindUser} onChange={(e) => setForm({ ...form, bindUser: e.target.value })} placeholder="administrator@example.invalid" required />
              </div>
              <div>
                <Label htmlFor="bindPassword">Bind password</Label>
                <Input id="bindPassword" type="password" autoComplete="new-password" value={form.bindPassword} onChange={(e) => setForm({ ...form, bindPassword: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="baseDN">Base DN override (optional)</Label>
                <Input id="baseDN" value={form.baseDN} onChange={(e) => setForm({ ...form, baseDN: e.target.value })} placeholder="Auto-discovered when empty" />
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="requireCert"
                  type="checkbox"
                  checked={form.requireCertValidation}
                  onChange={(e) => setForm({ ...form, requireCertValidation: e.target.checked })}
                />
                <label htmlFor="requireCert" className="text-sm">Require TLS certificate validation (default)</label>
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="allowInsecure"
                  type="checkbox"
                  checked={form.allowInsecure}
                  onChange={(e) => setForm({ ...form, allowInsecure: e.target.checked })}
                />
                <label htmlFor="allowInsecure" className="text-sm font-medium text-red-700">
                  Lab-only: bypass certificate validation (unsafe, never the default)
                </label>
              </div>
              {formError ? <p className="text-sm text-red-700 md:col-span-2">{formError}</p> : null}
              <div className="md:col-span-2">
                <Button type="submit">Add profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {profiles.length === 0 ? (
          <Alert>No profiles yet. Add your first LDAPS directory above.</Alert>
        ) : (
          <div className="space-y-4">
            {profiles.map((profile) => {
              const result = results[profile.id];
              const discovery = loadDiscovery(profile.id);
              return (
                <Card key={profile.id}>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">{profile.displayName}</h3>
                        <p className="font-mono text-xs text-neutral-500">ldaps://{profile.host}:{profile.port}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {profile.id === activeId ? <Badge>Active</Badge> : null}
                        <Button variant="outline" size="sm" onClick={() => handleTest(profile)} disabled={testingId === profile.id}>
                          {testingId === profile.id ? 'Testing…' : 'Test connection'}
                        </Button>
                        {profile.id !== activeId ? (
                          <Button variant="outline" size="sm" onClick={() => handleActivate(profile.id)}>Set active</Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(profile.id)}>Delete</Button>
                      </div>
                    </div>
                    {result ? (
                      <div className="rounded-md border border-neutral-200 p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {STAGES.map((s) => (
                            <Badge key={s.key} className={result.diagnostics[s.key] ? 'bg-neutral-900 text-white' : ''}>
                              {s.label}: {result.diagnostics[s.key] ? 'ok' : '—'}
                            </Badge>
                          ))}
                        </div>
                        {result.error ? <p className="mt-2 text-sm text-red-700">{result.error}</p> : null}
                        {result.metadata?.defaultNamingContext ? (
                          <p className="mt-2 font-mono text-xs">Default NC: {result.metadata.defaultNamingContext}</p>
                        ) : null}
                      </div>
                    ) : discovery ? (
                      <p className="font-mono text-xs text-neutral-500">
                        Last discovery: {discovery.defaultNamingContext ?? 'no naming context recorded'}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyDiag(): Diagnostics {
  return { network: false, tlsHandshake: false, certValidation: false, ldap: false, rootDSE: false, bind: false, discovery: false };
}
