import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AdminPanelClient } from './AdminPanelClient';
import { Agent } from '@/components/chat-interface';

async function getUserRole(supabaseClient: any, userId: string) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        return null;
    }
    return profile.role as 'admin' | 'partner';
}

export default async function AdminPage() {
    const cookieStore = cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
          },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/auth/login');
    }

    const userRole = await getUserRole(supabase, user.id);

    if (userRole !== 'admin') {
        redirect('/');
    }

    const { data: agents, error } = await supabase.from('agents').select('*');

    if (error) {
        return <div>Error loading agents.</div>;
    }

    return <AdminPanelClient initialAgents={agents as Agent[] || []} />;
}
