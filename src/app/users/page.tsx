import { ActiveProfileBanner } from '@/components/layout/active-profile-banner';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function UsersPage() {
  return (
    <div>
      <ActiveProfileBanner />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-neutral-500">Live user search per active profile (issue #4).</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Not implemented yet</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              User listing, search, and detail views are not part of this vertical slice. The
              dashboard preview table is mock data only.
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
