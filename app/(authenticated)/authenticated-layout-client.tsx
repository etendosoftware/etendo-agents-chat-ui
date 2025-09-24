
'use client'

import { GlobalHeader } from '@/components/global-header';
import { User } from '@supabase/supabase-js';
import { usePathname } from 'next/navigation';

interface AuthenticatedLayoutClientProps {
    user: User | null;
    userRole: string | null;
    children: React.ReactNode;
}

export default function AuthenticatedLayoutClient({ user, userRole, children }: AuthenticatedLayoutClientProps) {
    const pathname = usePathname();
    const isChatPage = pathname.includes('/chat/');

    return (
        <div className='w-full h-screen flex flex-col bg-gradient-custom'>
            {!isChatPage && <GlobalHeader user={user} userRole={userRole} disableHamburgerMenu />}
            <main className='flex-1 overflow-y-auto md:overflow-y-hidden'>
                {children}
            </main>
        </div>
    )
}
