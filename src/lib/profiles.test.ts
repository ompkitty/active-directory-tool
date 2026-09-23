import { describe, expect, it } from 'vitest';
import { applyProfileEdit } from './profiles';
import type { PersistedProfile } from '@/types';

const profiles: PersistedProfile[] = [
  {
    id: 'a',
    displayName: 'Lab A',
    host: 'dc01.example.invalid',
    port: 636,
    bindUser: 'admin@example.invalid',
    certValidation: true,
  },
  {
    id: 'b',
    displayName: 'Lab B',
    host: 'dc02.example.invalid',
    port: 6636,
    bindUser: 'admin@example.invalid',
    certValidation: true,
  },
];

describe('applyProfileEdit', () => {
  it('updates only the targeted profile and preserves its id', () => {
    const next = applyProfileEdit(profiles, 'a', { host: 'new.example.invalid', port: 636 });
    expect(next.find((p) => p.id === 'a')).toMatchObject({
      id: 'a',
      host: 'new.example.invalid',
      displayName: 'Lab A',
    });
    expect(next.find((p) => p.id === 'b')).toEqual(profiles[1]);
  });

  it('leaves the list unchanged for an unknown id', () => {
    expect(applyProfileEdit(profiles, 'missing', { host: 'x' })).toEqual(profiles);
  });
});
