import { describe, expect, it } from 'vitest';
import { filterOptions, type ComboboxOption } from './combobox';

const options: ComboboxOption[] = [
  { value: 'OU=Sales,DC=example,DC=invalid', label: 'Sales', hint: 'OU=Sales,DC=example,DC=invalid' },
  { value: 'CN=Users,DC=example,DC=invalid', label: 'Users', hint: 'CN=Users,DC=example,DC=invalid' },
  { value: 'OU=IT,DC=example,DC=invalid', label: 'IT', hint: 'OU=IT,DC=example,DC=invalid' },
];

describe('filterOptions', () => {
  it('returns everything for empty text', () => {
    const { visible, hidden } = filterOptions(options, '');
    expect(visible).toHaveLength(3);
    expect(hidden).toBe(0);
  });

  it('matches labels and DNs case-insensitively', () => {
    expect(filterOptions(options, 'sales').visible.map((o) => o.label)).toEqual(['Sales']);
    expect(filterOptions(options, 'cn=users').visible.map((o) => o.label)).toEqual(['Users']);
  });

  it('caps visible entries and reports the remainder', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      value: `OU=Dept${i},DC=x`,
      label: `Dept${i}`,
    }));
    const { visible, hidden } = filterOptions(many, '');
    expect(visible).toHaveLength(50);
    expect(hidden).toBe(10);
  });
});
