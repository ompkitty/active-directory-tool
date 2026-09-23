'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  applyAttributeEdit,
  COMMON_OPTIONAL_ATTRIBUTES,
  isProtectedAttribute,
  splitUserAttributes,
  type AttributeRow,
} from '@/lib/directory-attributes';
import type { DirectoryUser } from '@/types';

function AttributeEditor({
  attribute,
  current,
  mode,
  onDone,
  onSave,
}: {
  attribute: string;
  current: string[];
  mode?: 'edit' | 'add';
  onDone: (updated: string[] | null) => void;
  onSave: (attribute: string, values: string[]) => Promise<string[]>;
}) {
  const [draft, setDraft] = useState(current.join('\n'));
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = draft
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const verified = await onSave(attribute, parsed);
      onDone(verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attribute update failed.');
      setConfirming(false);
      setSaving(false);
    }
  }

  if (confirming) {
    const verb = mode === 'add' ? 'Add' : 'Replace';
    return (
      <div className="mt-2 space-y-2 rounded-md border border-neutral-300 bg-neutral-50 p-2">
        <p className="text-xs font-medium">
          {verb} <span className="font-mono">{attribute}</span> with {parsed.length} value
          {parsed.length === 1 ? '' : 's'}?
        </p>
        <ul className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-xs">
          {parsed.map((v, i) => (
            <li key={i} className="break-all">
              + {v}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button size="sm" disabled={saving} onClick={handleConfirm}>
            {saving ? 'Saving…' : `Confirm ${mode === 'add' ? 'add' : 'replace'}`}
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => setConfirming(false)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <label htmlFor={`attr-edit-${attribute}`} className="text-xs text-neutral-500">
        One value per line.
      </label>
      <textarea
        id={`attr-edit-${attribute}`}
        rows={Math.min(5, Math.max(2, parsed.length + 1))}
        className="w-full rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:outline-neutral-900"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={parsed.length === 0}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Review change
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AddAttributeForm({
  existingNames,
  onDone,
  onSave,
}: {
  /** Lowercase attribute names already present (known + additional). */
  existingNames: Set<string>;
  onDone: (attribute: string, updated: string[] | null) => void;
  onSave: (attribute: string, values: string[]) => Promise<string[]>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!adding) {
    return (
      <div className="mt-2">
        <Button size="sm" variant="outline" onClick={() => { setError(null); setName(''); setAdding(true); }}>
          Add attribute
        </Button>
      </div>
    );
  }

  const trimmed = name.trim();
  return (
    <div className="mt-2 space-y-2 rounded-md border border-neutral-200 p-2">
      <label htmlFor="add-attr-name" className="text-xs text-neutral-500">
        Attribute name (suggestions or any directory attribute).
      </label>      <input
        id="add-attr-name"
        list="add-attr-suggestions"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="telephoneNumber"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-neutral-900"
      />
      <datalist id="add-attr-suggestions">
        {COMMON_OPTIONAL_ATTRIBUTES.map((s) => (
          <option key={s.name} value={s.name}>
            {s.label}
          </option>
        ))}
      </datalist>
      <p className="text-xs text-neutral-500">
        Custom names only work if they exist in the directory schema — otherwise the server
        rejects them.
      </p>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {trimmed && !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(trimmed) ? (
        <p className="text-xs text-red-700">Invalid attribute name.</p>
      ) : null}
      {trimmed && existingNames.has(trimmed.toLowerCase()) ? (
        <p className="text-xs text-red-700">Already present — edit it directly instead.</p>
      ) : null}
      {trimmed && isProtectedAttribute(trimmed) ? (
        <p className="text-xs text-red-700">System-managed — cannot be added here.</p>
      ) : null}
      {trimmed &&
      /^[a-zA-Z][a-zA-Z0-9-]*$/.test(trimmed) &&
      !existingNames.has(trimmed.toLowerCase()) &&
      !isProtectedAttribute(trimmed) ? (
        <AttributeEditor
          attribute={trimmed}
          current={[]}
          mode="add"
          onDone={(updated) => {
            setAdding(false);
            onDone(trimmed, updated);
          }}
          onSave={onSave}
        />
      ) : null}
      <div>
        <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Section({  title,
  rows,
  editable,
  editingAttr,
  onStartEdit,
  onDoneEdit,
  onSave,
}: {
  title: string;
  rows: AttributeRow[];
  editable: boolean;
  editingAttr: string | null;
  onStartEdit: (attribute: string) => void;
  onDoneEdit: (attribute: string, updated: string[] | null) => void;
  onSave: (attribute: string, values: string[]) => Promise<string[]>;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <dl className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {rows.map((r) => {
          const locked = isProtectedAttribute(r.attribute);
          const canEdit = editable && !locked;
          const isEditing = canEdit && editingAttr === r.attribute;
          return (
            <div key={r.attribute} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
              <dt className="font-mono text-xs text-neutral-500">{r.name}</dt>
              <dd className="col-span-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-all">
                    {r.available ? (
                      r.values.map((v, i) => (
                        <p key={i} className="font-mono text-xs">
                          {v}
                        </p>
                      ))
                    ) : (
                      <span className="text-xs text-neutral-400">Not provided by this directory</span>
                    )}
                    {editable && r.available && locked ? (
                      <p className="mt-1 text-xs text-neutral-400">System-managed — read-only here</p>
                    ) : null}
                  </div>
                  {canEdit && !isEditing ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 shrink-0 px-1.5 text-xs font-normal text-neutral-500 hover:text-neutral-900"
                      onClick={() => onStartEdit(r.attribute)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
                {isEditing ? (
                  <AttributeEditor
                    attribute={r.attribute}
                    current={r.values}
                    onDone={(updated) => onDoneEdit(r.attribute, updated)}
                    onSave={onSave}
                  />
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function UserDetail({
  user,
  profileName,
  baseDN,
  onSaveAttribute,
  onUserChange,
  onSetAccountState,
  onAccountStateChange,
}: {
  user: DirectoryUser;
  profileName: string;
  baseDN: string;
  /** Server round-trip; resolves with verified values. Absent = read-only. */
  onSaveAttribute?: (attribute: string, values: string[]) => Promise<string[]>;
  onUserChange?: (user: DirectoryUser) => void;
  /** Server round-trip for enable/disable; resolves with the verified state. */
  onSetAccountState?: (enabled: boolean) => Promise<boolean>;
  onAccountStateChange?: (enabled: boolean) => void;
}) {
  const [editingAttr, setEditingAttr] = useState<string | null>(null);
  const [confirmingState, setConfirmingState] = useState<boolean | null>(null);
  const [savingState, setSavingState] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const sections = splitUserAttributes(user);
  const editable = typeof onSaveAttribute === 'function';
  const canToggleState =
    typeof onSetAccountState === 'function' && user.enabled !== undefined;

  function handleDone(attribute: string, updated: string[] | null) {
    setEditingAttr(null);
    if (updated && onUserChange) onUserChange(applyAttributeEdit(user, attribute, updated));
  }

  async function handleConfirmState() {
    if (confirmingState === null || !onSetAccountState) return;
    setSavingState(true);
    setStateError(null);
    try {
      const verified = await onSetAccountState(confirmingState);
      setConfirmingState(null);
      onAccountStateChange?.(verified);
    } catch (err) {
      setStateError(err instanceof Error ? err.message : 'Account state change failed.');
    } finally {
      setSavingState(false);
    }
  }

  const sectionProps = {
    editable,
    editingAttr,
    onStartEdit: (attribute: string) => setEditingAttr(attribute),
    onDoneEdit: handleDone,
    onSave: onSaveAttribute ?? (async () => [] as string[]),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{profileName}</Badge>
        <span className="font-mono text-xs text-neutral-500">{baseDN}</span>
      </div>
      <Section title="Identity" rows={sections.identity} {...sectionProps} />
      <Section title="Account state" rows={sections.account} {...sectionProps} />
      {canToggleState ? (
        <div className="rounded-md border border-neutral-200 px-3 py-2">
          {confirmingState === null ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-neutral-500">
                {user.enabled ? 'Account is enabled.' : 'Account is disabled.'}
              </p>
              <Button
                size="sm"
                variant={user.enabled ? 'destructive' : 'default'}
                onClick={() => {
                  setStateError(null);
                  setConfirmingState(!user.enabled);
                }}
              >
                {user.enabled ? 'Disable account' : 'Enable account'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                {confirmingState ? 'Enable' : 'Disable'} account{' '}
                <span className="font-medium">{user.displayName ?? user.sAMAccountName}</span>?
                Only the disable flag is flipped; all other account flags are preserved.
              </p>
              {stateError ? <p className="text-xs text-red-700">{stateError}</p> : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={confirmingState ? 'default' : 'destructive'}
                  disabled={savingState}
                  onClick={handleConfirmState}
                >
                  {savingState ? 'Saving…' : `Confirm ${confirmingState ? 'enable' : 'disable'}`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingState}
                  onClick={() => setConfirmingState(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <Section title="Attributes" rows={sections.normalized} {...sectionProps} />
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Additional attributes ({sections.additional.length})
        </h3>
        {sections.additional.length === 0 ? (
          <p className="text-sm text-neutral-500">
            The directory returned no further attributes for this entry.
          </p>
        ) : (
          <Section title="Discovered" rows={sections.additional} {...sectionProps} />
        )}
        {editable ? (
          <AddAttributeForm
            existingNames={
              new Set([
                ...sections.identity.map((r) => r.attribute.toLowerCase()),
                ...sections.account.map((r) => r.attribute.toLowerCase()),
                ...sections.normalized.map((r) => r.attribute.toLowerCase()),
                ...sections.additional.map((r) => r.attribute.toLowerCase()),
              ])
            }
            onDone={handleDone}
            onSave={sectionProps.onSave}
          />
        ) : null}
      </div>
    </div>
  );
}
