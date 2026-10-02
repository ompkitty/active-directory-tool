'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { getActiveId, loadProfiles } from '@/lib/profiles';

function readLabel(): string | null {
  if (typeof window === 'undefined') return null;
  const profiles = loadProfiles();
  const active = profiles.find((p) => p.id === getActiveId()) ?? null;
  return active ? `${active.displayName} · ldaps://${active.host}:${active.port}` : null;
}

export function ActiveProfileBanner() {
  const [label] = useState<string | null>(readLabel);

  return (
    <div className="flex items-center gap-2 border-b border-subtle bg-surface px-6 py-2.5">
      <span className="text-xs text-muted-foreground">Active directory:</span>
      {label ? (
        <Badge>{label}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">None selected — open Connections to add a profile.</span>
      )}
    </div>
  );
}
