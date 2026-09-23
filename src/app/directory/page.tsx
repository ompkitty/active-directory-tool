import { ActiveProfileBanner } from '@/components/layout/active-profile-banner';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DirectoryPage() {
  return (
    <div>
      <ActiveProfileBanner />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Directory</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Naming contexts, attributes, and capabilities per profile (issue #3).
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Discovery details</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              Extended discovery (schema references, capabilities) follows in issue #3. The dashboard
              already shows the discovered default naming context and naming contexts.
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
