'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  applyAttributeEdit,
  isProtectedAttribute,
  splitUserAttributes,
  type AttributeRow,
} from '@/lib/directory-attributes';
import type { DirectoryUser } from '@/types';

function AttributeEditor({
  attribute,
  current,
  onDone,
  onSave,
}: {
  attribute: string;
  current: string[];
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
    return (
      <div className="mt-2 space-y-2 rounded-md border border-neutral-300 bg-neutral-50 p-2">
        <p className="text-xs font-medium">
          Replace <span className="font-mono">{attribute}</span> with {parsed.length} value
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
            {saving ? 'Saving…' : 'Confirm replace'}
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

function Section({
  title,
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
          const canEdit = editable && r.available && !locked;
          const isEditing = canEdit && editingAttr === r.attribute;
          return (
            <div key={r.attribute} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
              <dt className="font-mono text-xs text-neutral-500">{r.name}</dt>
              <dd className="col-span-2 break-all text-sm">
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
                {canEdit && !isEditing ? (
                  <div className="mt-1">
                    <Button size="sm" variant="outline" onClick={() => onStartEdit(r.attribute)}>
                      Edit
                    </Button>
                  </div>
                ) : null}
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
}: {
  user: DirectoryUser;
  profileName: string;
  baseDN: string;
  /** Server round-trip; resolves with verified values. Absent = read-only. */
  onSaveAttribute?: (attribute: string, values: string[]) => Promise<string[]>;
  onUserChange?: (user: DirectoryUser) => void;
}) {
  const [editingAttr, setEditingAttr] = useState<string | null>(null);
  const sections = splitUserAttributes(user);
  const editable = typeof onSaveAttribute === 'function';

  function handleDone(attribute: string, updated: string[] | null) {
    setEditingAttr(null);
    if (updated && onUserChange) onUserChange(applyAttributeEdit(user, attribute, updated));
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
      </div>
    </div>
  );
}
