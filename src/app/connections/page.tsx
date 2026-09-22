'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ConnectionsPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    displayName: '',
    host: '',
    port: 636,
    bindUser: '',
    bindPassword: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newProfile = {
      id: Date.now().toString(),
      ...formData,
      active: profiles.length === 0,
    };
    setProfiles([...profiles, newProfile]);
    setFormData({ displayName: '', host: '', port: 636, bindUser: '', bindPassword: '' });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Connection Profiles</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Add Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Display Name</Label>
              <Input value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} required />
            </div>
            <div>
              <Label>Hostname</Label>
              <Input value={formData.host} onChange={e => setFormData({...formData, host: e.target.value})} placeholder="dc01.lab1.local" required />
            </div>
            <div>
              <Label>Port</Label>
              <Input type="number" value={formData.port} onChange={e => setFormData({...formData, port: parseInt(e.target.value)})} />
            </div>
            <div>
              <Label>Bind User</Label>
              <Input value={formData.bindUser} onChange={e => setFormData({...formData, bindUser: e.target.value})} placeholder="CN=Admin,DC=lab1,DC=local" required />
            </div>
            <div>
              <Label>Bind Password</Label>
              <Input type="password" value={formData.bindPassword} onChange={e => setFormData({...formData, bindPassword: e.target.value})} required />
            </div>
            <Button type="submit">Add Profile</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {profiles.map(profile => (
          <Card key={profile.id} className={profile.active ? 'border-primary' : ''}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">{profile.displayName}</h3>
                  <p className="text-sm text-muted-foreground">ldaps://{profile.host}:{profile.port}</p>
                </div>
                <Button variant="outline">Test Connection</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
