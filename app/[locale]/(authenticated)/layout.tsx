import '../../globals.css'
import { createClient } from '@/lib/supabase/server';
import { buildProfileAccessState, getUserAccessLabel } from '@/lib/auth/access-state';
import AuthenticatedLayoutClient from './authenticated-layout-client';

async function getUserAccessState(supabaseClient: any, userId: string) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role, is_partner, is_customer')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        return null;
    }
    return buildProfileAccessState(profile);
}

export default async function AuthenticatedLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const supabaseClient = createClient();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const accessState = user ? await getUserAccessState(supabaseClient, user.id) : null;

    return (
        <AuthenticatedLayoutClient user={user} userRole={getUserAccessLabel(accessState)}>
            {children}
        </AuthenticatedLayoutClient>
    )
}
