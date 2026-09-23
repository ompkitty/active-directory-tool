import { Badge } from '@/components/ui/badge';
import { splitUserAttributes, type AttributeRow } from '@/lib/directory-attributes';
import type { DirectoryUser } from '@/types';

function Section({ title, rows }: { title: string; rows: AttributeRow[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <dl className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
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
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function UserDetail({
  user,
  profileName,
  baseDN,
}: {
  user: DirectoryUser;
  profileName: string;
  baseDN: string;
}) {
  const sections = splitUserAttributes(user);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{profileName}</Badge>
        <span className="font-mono text-xs text-neutral-500">{baseDN}</span>
      </div>
      <Section title="Identity" rows={sections.identity} />
      <Section title="Account state" rows={sections.account} />
      <Section title="Attributes" rows={sections.normalized} />
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Additional attributes ({sections.additional.length})
        </h3>
        {sections.additional.length === 0 ? (
          <p className="text-sm text-neutral-500">
            The directory returned no further attributes for this entry.
          </p>
        ) : (
          <Section title="Discovered" rows={sections.additional} />
        )}
      </div>
    </div>
  );
}
