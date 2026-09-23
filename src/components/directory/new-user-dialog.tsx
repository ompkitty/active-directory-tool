'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateUserResult } from '@/lib/ldap/mutations';
export interface NewUserForm {
  parentDN: string;
  sAMAccountName: string;
  givenName: string;
  surname: string;
  displayName: string;
  userPrincipalName: string;
  password: string;
  enableAfterCreate: boolean;
}

function validate(form: NewUserForm, confirm: string): string | null {
  if (!form.parentDN.trim() || !form.parentDN.includes('=')) return 'Target container DN is required.';
  if (!/^[a-zA-Z0-9._-]{1,20}$/.test(form.sAMAccountName.trim())) {
    return 'Account name must be 1-20 characters (letters, digits, dot, underscore, hyphen).';
  }
  if (!form.givenName.trim() || !form.surname.trim()) return 'First and last name are required.';
  if (form.password.length < 8) return 'Password must be at least 8 characters.';
  if (form.password !== confirm) return 'Passwords do not match.';
  return null;
}

export function NewUserDialog({
  open,
  onClose,
  defaultParentDN,
  onCreate,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultParentDN: string;
  onCreate: (form: NewUserForm) => Promise<CreateUserResult>;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NewUserForm>({
    parentDN: defaultParentDN,
    sAMAccountName: '',
    givenName: '',
    surname: '',
    displayName: '',
    userPrincipalName: '',
    password: '',
    enableAfterCreate: true,
  });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreateUserResult | null>(null);

  function close() {
    setError(null);
    setSaving(false);
    setCreated(null);
    setConfirm('');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(form, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onCreate(form);
      setCreated(result);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User creation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Create user">
      {created ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">User created.</p>
          <p className="break-all font-mono text-xs">{created.dn}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Password set: {created.passwordSet ? 'yes' : 'no'}</li>
            <li>Account enabled: {created.enabled ? 'yes' : 'no'}</li>
          </ul>
          {created.warning ? (
            <p className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-red-700">
              {created.warning}
            </p>
          ) : null}
          <Button onClick={close}>Close</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="newu-account">Account name (sAMAccountName)</Label>
            <Input id="newu-account" value={form.sAMAccountName} onChange={(e) => setForm({ ...form, sAMAccountName: e.target.value })} required maxLength={20} />
          </div>
          <div>
            <Label htmlFor="newu-parent">Target container DN</Label>
            <Input id="newu-parent" value={form.parentDN} onChange={(e) => setForm({ ...form, parentDN: e.target.value })} required className="font-mono text-xs" />
          </div>
          <div>
            <Label htmlFor="newu-given">First name</Label>
            <Input id="newu-given" value={form.givenName} onChange={(e) => setForm({ ...form, givenName: e.target.value })} required maxLength={64} />
          </div>
          <div>
            <Label htmlFor="newu-surname">Last name</Label>
            <Input id="newu-surname" value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} required maxLength={64} />
          </div>
          <div>
            <Label htmlFor="newu-display">Display name (optional)</Label>
            <Input id="newu-display" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Defaults to First Last" maxLength={256} />
          </div>
          <div>
            <Label htmlFor="newu-upn">User principal name (optional)</Label>
            <Input id="newu-upn" value={form.userPrincipalName} onChange={(e) => setForm({ ...form, userPrincipalName: e.target.value })} placeholder="user@domain" maxLength={512} />
          </div>
          <div>
            <Label htmlFor="newu-password">Initial password</Label>
            <Input id="newu-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="newu-confirm">Confirm password</Label>
            <Input id="newu-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="newu-enable"
              type="checkbox"
              checked={form.enableAfterCreate}
              onChange={(e) => setForm({ ...form, enableAfterCreate: e.target.checked })}
            />
            <label htmlFor="newu-enable" className="text-sm">Enable account after creation (default)</label>
          </div>
          {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create user'}
            </Button>
            <Button variant="outline" onClick={close} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
