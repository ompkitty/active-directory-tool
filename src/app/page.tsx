import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const activeProfile = {
    displayName: 'Lab AD',
    host: 'dc01.lab1.local',
    port: 636,
    status: 'Connected',
    defaultNamingContext: 'DC=lab1,DC=local',
    namingContexts: ['DC=lab1,DC=local', 'CN=Configuration,DC=lab1,DC=local'],
    domainController: 'dc01.lab1.local',
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Active Directory Tool</h1>
        <Button asChild variant="outline">
          <Link href="/connections">Manage Connections</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm"><span className="text-muted-foreground">Status:</span> {activeProfile.status}</p>
            <p className="text-sm"><span className="text-muted-foreground">Host:</span> {activeProfile.host}</p>
            <p className="text-sm"><span className="text-muted-foreground">Port:</span> {activeProfile.port} (LDAPS)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{activeProfile.displayName}</p>
            <p className="text-xs text-muted-foreground mt-1">ldaps://{activeProfile.host}:{activeProfile.port}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Discovery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm"><span className="text-muted-foreground">Default NC:</span></p>
            <p className="text-xs font-mono">{activeProfile.defaultNamingContext}</p>
            <p className="text-sm"><span className="text-muted-foreground">DC:</span> {activeProfile.domainController}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm"><span className="text-muted-foreground">Naming Contexts:</span></p>
            <ul className="text-xs font-mono space-y-1">
              {activeProfile.namingContexts.map((nc: string, i: number) => (
                <li key={i}>• {nc}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">User search functionality coming soon</p>
          <p className="text-xs mt-2">Mock data - real LDAP integration in progress</p>
        </CardContent>
      </Card>
    </div>
  );
}
