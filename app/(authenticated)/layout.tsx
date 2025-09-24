import '../globals.css'
import { createClient } from '@/lib/supabase/server';
import AuthenticatedLayoutClient from './authenticated-layout-client';

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

export default async function AuthenticatedLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const supabaseClient = createClient();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const userRole = user ? await getUserRole(supabaseClient, user.id) : null;

    return (
        <AuthenticatedLayoutClient user={user} userRole={userRole}>
            {children}
        </AuthenticatedLayoutClient>
    )
}
