'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActiveProfileBanner } from '@/components/layout/active-profile-banner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserDetail } from '@/components/directory/user-detail';
import { NewUserDialog, type NewUserForm } from '@/components/directory/new-user-dialog';
import { getActiveId, getSessionPassword, loadDiscovery, loadProfiles, setSessionPassword } from '@/lib/profiles';
import type { DirectoryUser, PersistedProfile } from '@/types';
import type { CreateUserResult } from '@/lib/ldap/mutations';

interface CachedSearch {
  query: string;
  users: DirectoryUser[];
  baseDN: string;
  count: number;
}

export default function UsersPage() {
  const [profiles] = useState<PersistedProfile[]>(() =>
    typeof window === 'undefined' ? [] : loadProfiles(),
  );
  const [activeId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getActiveId(),
  );
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState('50');
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<Record<string, CachedSearch>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDn, setSelectedDn] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [containersCache, setContainersCache] = useState<
    Record<string, { dn: string; name: string }[]>
  >({});
  const [containersLoading, setContainersLoading] = useState(false);
  const [containersError, setContainersError] = useState<string | null>(null);

  const active = profiles.find((p) => p.id === activeId) ?? null;
  const result = activeId ? cache[activeId] : undefined;
  const error = activeId ? errors[activeId] : undefined;
  const hasSessionPassword = activeId ? getSessionPassword(activeId) !== undefined : false;
  const selectedUser =
    selectedDn && result ? (result.users.find((u) => u.dn === selectedDn) ?? null) : null;

  /** Single-attribute replace with server verification; updates the per-profile cache. */
  async function handleSaveAttribute(attribute: string, values: string[]): Promise<string[]> {
    if (!active || !activeId || !selectedUser) throw new Error('No active user context.');
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) throw new Error('Enter the bind password first (memory-only, never stored).');
    const res = await fetch('/api/users/attributes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...active, bindPassword, dn: selectedUser.dn, attribute, values }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Attribute update failed.');
    }
    return data.values as string[];
  }

  function handleUserChange(updated: DirectoryUser) {
    if (!activeId) return;
    setCache((prev) => {
      const entry = prev[activeId];
      if (!entry) return prev;
      return {
        ...prev,
        [activeId]: {
          ...entry,
          users: entry.users.map((u) => (u.dn === updated.dn ? updated : u)),
        },
      };
    });
  }

  /** Enable/disable with server verification; updates the per-profile cache. */
  async function handleSetAccountState(enabled: boolean): Promise<boolean> {
    if (!active || !activeId || !selectedUser) throw new Error('No active user context.');
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) throw new Error('Enter the bind password first (memory-only, never stored).');
    const res = await fetch('/api/users/account-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...active, bindPassword, dn: selectedUser.dn, enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Account state change failed.');
    }
    return data.enabled as boolean;
  }

  function handleAccountStateChange(enabled: boolean) {
    if (!activeId || !selectedUser) return;
    handleUserChange({ ...selectedUser, enabled });
  }

  /** Deliberate admin password reset; nothing is cached or displayed. */
  async function handleResetPassword(
    newPassword: string,
    mustChangeAtNextLogon: boolean,
  ): Promise<{ mustChangeAtNextLogon: boolean; warning?: string }> {
    if (!active || !activeId || !selectedUser) throw new Error('No active user context.');
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) throw new Error('Enter the bind password first (memory-only, never stored).');
    const res = await fetch('/api/users/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...active, bindPassword, dn: selectedUser.dn, newPassword, mustChangeAtNextLogon }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Password reset failed.');
    }
    return {
      mustChangeAtNextLogon: data.mustChangeAtNextLogon as boolean,
      warning: typeof data.warning === 'string' ? data.warning : undefined,
    };
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch();
  }

  /** Load OU/container candidates once per profile for the create dialog. */
  async function openCreateDialog() {
    setCreateOpen(true);
    if (!active || !activeId || containersCache[activeId]) return;
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) return;
    setContainersLoading(true);
    setContainersError(null);
    try {
      const res = await fetch('/api/containers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...active, bindPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Container listing failed.');
      setContainersCache((prev) => ({ ...prev, [activeId]: data.containers }));
    } catch (err) {
      setContainersError(err instanceof Error ? err.message : 'Container listing failed.');
    } finally {
      setContainersLoading(false);
    }
  }

  /** Create-user round-trip; the dialog refreshes the listing on success. */
  async function handleCreateUser(form: NewUserForm): Promise<CreateUserResult> {
    if (!active || !activeId) throw new Error('No active profile.');
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) throw new Error('Enter the bind password first (memory-only, never stored).');
    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...active, bindPassword, ...form }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'User creation failed.');
    }
    return data as CreateUserResult;
  }

  /** Shared search core so create-user can refresh the listing afterwards. */
  async function runSearch() {
    if (!active || !activeId) return;
    const bindPassword = password || getSessionPassword(activeId) || '';
    if (!bindPassword) {
      setErrors((prev) => ({
        ...prev,
        [activeId]: 'Enter the bind password (passwords are kept in memory only and never stored).',
      }));
      return;
    }
    if (password) setSessionPassword(activeId, password);
    setLoading(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[activeId];
      return next;
    });
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...active,
          bindPassword,
          query,
          limit: parseInt(limit, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'User search failed.');
      }
      setCache((prev) => ({
        ...prev,
        [activeId]: {
          query,
          users: data.users as DirectoryUser[],
          baseDN: data.baseDN as string,
          count: data.count as number,
        },
      }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [activeId]: err instanceof Error ? err.message : 'User search failed.',
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ActiveProfileBanner />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Users</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Live search scoped to the active profile. Results are never shared between profiles.
            </p>
          </div>
          {active ? <Button onClick={openCreateDialog}>New user</Button> : null}
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
                <CardTitle>Search in {active.displayName}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch} className="grid gap-4 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="user-query">Search query</Label>
                    <Input
                      id="user-query"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Name, account, UPN, or mail (empty lists users)"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <Label htmlFor="user-limit">Limit</Label>
                    <Select id="user-limit" value={limit} onChange={(e) => setLimit(e.target.value)}>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="user-password">
                      Bind password{hasSessionPassword ? ' (saved for this session)' : ''}
                    </Label>
                    <Input
                      id="user-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={hasSessionPassword ? '••••••••' : 'Required per session'}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Searching…' : 'Search'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {loading ? (
              <Card>
                <CardContent className="space-y-2 pt-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ) : error ? (
              <Alert>{error}</Alert>
            ) : result ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {result.count} user{result.count === 1 ? '' : 's'}
                    {result.query ? ` for “${result.query}”` : ''}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 font-mono text-xs text-neutral-500">Base: {result.baseDN}</p>
                  {result.users.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No users found. Try a different query or check the base DN discovery for this
                      profile.
                    </p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                          <th className="py-2 pr-4 font-medium">Name</th>
                          <th className="py-2 pr-4 font-medium">Account</th>
                          <th className="py-2 pr-4 font-medium">UPN</th>
                          <th className="py-2 pr-4 font-medium">State</th>
                          <th className="py-2 font-medium">
                            <span className="sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.users.map((u) => (
                          <tr key={u.dn} className="border-b border-neutral-100 align-top">
                            <td className="py-2 pr-4">
                              <p>{u.displayName ?? u.sAMAccountName ?? '—'}</p>
                              <p className="font-mono text-xs text-neutral-500">{u.dn}</p>
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs">
                              {u.sAMAccountName ?? '—'}
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs">
                              {u.userPrincipalName ?? u.mail ?? '—'}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge>
                                {u.enabled === undefined ? 'Unknown' : u.enabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </td>
                            <td className="py-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedDn(u.dn)}
                              >
                                Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Alert>
                No search yet for this profile. Enter a query (or leave it empty to list users) and
                press Search.
              </Alert>
            )}
          </>
        )}
      </div>
      <NewUserDialog
        key={activeId ?? 'none'}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultParentDN={
          activeId ? (result?.baseDN ?? loadDiscovery(activeId)?.effectiveBaseDN ?? '') : ''
        }
        containers={activeId ? (containersCache[activeId] ?? []) : []}
        containersLoading={containersLoading}
        containersError={containersError}
        onCreate={handleCreateUser}
        onCreated={() => void runSearch()}
      />
      <Dialog
        open={selectedUser !== null}
        onClose={() => setSelectedDn(null)}
        title={selectedUser?.displayName ?? selectedUser?.sAMAccountName ?? 'User details'}
      >
        {selectedUser && active && result ? (
          <UserDetail
            user={selectedUser}
            profileName={active.displayName}
            baseDN={result.baseDN}
            onSaveAttribute={handleSaveAttribute}
            onUserChange={handleUserChange}
            onSetAccountState={handleSetAccountState}
            onAccountStateChange={handleAccountStateChange}
            onResetPassword={handleResetPassword}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
