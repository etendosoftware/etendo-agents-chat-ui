import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from "next/link";
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Agent } from '@/components/chat-interface';
import { shouldListAgentOnHome } from '@/lib/agents/access';
import { getTranslator } from '@/i18n/translator';
import type { Locale } from '@/i18n/config';

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

export default async function Home({ params }: { params: { locale: Locale } }) {
    const cookieStore = cookies();
    const locale = params.locale;
    const tCommon = await getTranslator(locale, 'common');
    const tHome = await getTranslator(locale, 'home.dashboard');
    const localePrefix = `/${locale}`;

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
    if (!user) {
        redirect(`${localePrefix}/auth/login`);
    }
    const userRole = await getUserRole(supabaseClient, user.id);

    const { data: agents, error: agentsError } = await supabaseClient.from('agents').select('*');

    if (agentsError) {
        return <p>{tCommon('messages.loadingError')}</p>;
    }

    const agentIds = agents?.map(agent => agent.id) ?? [];
    let translationsMap = new Map<string, { name: string; description: string | null }>();

    if (agentIds.length > 0) {
        const { data: translations, error: translationsError } = await supabaseClient
            .from('agent_translations')
            .select('agent_id, name, description')
            .eq('locale', locale)
            .in('agent_id', agentIds);

        if (!translationsError && translations) {
            translationsMap = new Map(
                translations.map((translation) => [translation.agent_id, { name: translation.name, description: translation.description }])
            );
        }
    }

    const localizedAgents = agents.map(agent => {
        const translation = translationsMap.get(agent.id);
        return {
            ...agent,
            name: translation?.name ?? agent.name,
            description: translation?.description ?? agent.description,
        };
    });

    const filteredAgents = localizedAgents.filter(agent => shouldListAgentOnHome(agent.access_level, userRole));

    return (
        <div className='p-8'>
            <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-8">{tHome('title')}</h1>

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
                            <Link href={`${localePrefix}/chat/${agent.path.replace('/', '')}`}>
                                <Button>{tCommon('actions.chat')}</Button>
                            </Link>
                        </CardFooter>
                    </Card>
                ))}
                 {filteredAgents.length === 0 && (
                    <div className="col-span-full text-center text-gray-500">
                        <p>{tHome('empty')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
