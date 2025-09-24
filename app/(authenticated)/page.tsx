import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default async function Home() {
    const cookieStore = cookies();

    const supabaseClient = createServerClient(
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

    const { data: { user } } = await supabaseClient.auth.getUser();
    const userRole = user ? await getUserRole(supabaseClient, user.id) : null;

    const { data: agents, error: agentsError } = await supabaseClient.from('agents').select('*');

    if (agentsError) {
        return <p>Error loading agents.</p>;
    }

    const filteredAgents = agents.filter(agent => {
        if (agent.access_level === 'public') {
            return false;
        }
        if (agent.access_level === 'non_client') {
            return userRole === 'non_client' || userRole === 'admin';
        }
        if (agent.access_level === 'partner') {
            return userRole === 'partner' || userRole === 'admin';
        }
        if (agent.access_level === 'admin') {
            return userRole === 'admin';
        }
        return false;
    });

    return (
        <div className='p-8'>
            <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-8">Available agents</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAgents.map((agent: Agent) => (
                    <Card key={agent.id} className="bg-white shadow-lg hover:shadow-xl transition-shadow">
                        <CardHeader>
                            <div className="flex items-center gap-4">
                                <span className="text-4xl">{agent.icon}</span>
                                <div>
                                    <CardTitle className="text-gray-900">{agent.name}</CardTitle>
                                    <CardDescription className='pt-2'>{agent.description}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardFooter className="flex justify-end">
                            <Link href={`/chat/${agent.path.replace('/', '')}`}>
                                <Button>Chat</Button>
                            </Link>
                        </CardFooter>
                    </Card>
                ))}
                 {filteredAgents.length === 0 && (
                    <div className="col-span-full text-center text-gray-500">
                        <p>There are no agents available for you at this time.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
