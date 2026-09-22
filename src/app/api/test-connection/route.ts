import { NextRequest, NextResponse } from 'next/server';
import { LDAPService } from '@/lib/ldap/service';
import { ConnectionProfile } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const profile: ConnectionProfile = await request.json();
    
    if (!profile.host || !profile.bindUser || !profile.bindPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const service = new LDAPService();
    const result = await service.testConnection(profile);
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
