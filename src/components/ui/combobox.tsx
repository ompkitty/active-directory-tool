'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

const VISIBLE_MAX = 50;

export function filterOptions(
  options: ComboboxOption[],
  text: string,
): { visible: ComboboxOption[]; hidden: number } {
  const q = text.trim().toLowerCase();
  const matched = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          (o.hint ?? '').toLowerCase().includes(q),
      )
    : options;
  return { visible: matched.slice(0, VISIBLE_MAX), hidden: Math.max(0, matched.length - VISIBLE_MAX) };
}

/**
 * Filterable dropdown that also accepts free text (used as-is, e.g. a
 * manually entered DN). The popup is constrained to the field width so long
 * values cannot overflow the page; labels truncate with ellipsis.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  id,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Sync committed external values (selection or reset) during render.
  // Typing stays local until committed, so the cursor never jumps.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  const { visible, hidden } = filterOptions(options, text);
  const isCustom = text.trim() !== '' && !options.some((o) => o.value === text.trim());

  function commit(v: string) {
    onChange(v.trim());
    setText(v.trim());
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
      if (text.trim() !== value) onChange(text.trim());
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) =>
        visible.length === 0 ? 0 : (h + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length,
      );
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        commit(visible[highlight]?.value ?? text);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setText(value);
    }
  }

  return (
    <div ref={wrapRef} onBlur={handleBlur} className="relative">
      <input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={visible[highlight] ? `${listId}-${highlight}` : undefined}
        aria-autocomplete="list"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 font-mono text-xs placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:outline-neutral-900 disabled:opacity-50"
      />
      {isCustom && !disabled ? (
        <p className="mt-1 text-xs text-neutral-500">Custom DN will be used.</p>
      ) : null}
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {visible.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o.value);
              }}
              className={cn(
                'cursor-pointer px-3 py-1.5',
                i === highlight ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100',
              )}
            >
              <p className="truncate text-sm">{o.label}</p>
              {o.hint ? (
                <p className={cn('truncate font-mono text-xs', i === highlight ? 'text-neutral-300' : 'text-neutral-500')}>
                  {o.hint}
                </p>
              ) : null}
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-neutral-500">
              No match — press Enter to use the typed DN.
            </li>
          ) : null}
          {hidden > 0 ? (
            <li aria-hidden className="px-3 py-1.5 text-xs text-neutral-500">
              +{hidden} more — keep typing to narrow down.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
