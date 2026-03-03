import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Agent } from '@/components/chat-interface';
import { shouldListAgentOnHome } from '@/lib/agents/access';
import { getTranslator } from '@/i18n/translator';
import type { Locale } from '@/i18n/config';
import HomeAgentCard from '@/components/home-agent-card';

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
        <div className='mx-auto w-full max-w-7xl px-6 py-8 md:px-10'>
            <div className="mb-8 rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-6 shadow-sm backdrop-blur-sm">
              <h1 className="text-2xl md:text-4xl font-bold text-slate-900">{tHome('title')}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-700 md:text-base">{tHome('description')}</p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredAgents.map((agent: Agent) => (
                    <HomeAgentCard
                      key={agent.id}
                      agent={agent}
                      localePrefix={localePrefix}
                      chatLabel={tCommon('actions.chat')}
                    />
                ))}
                 {filteredAgents.length === 0 && (
                    <div className="col-span-full rounded-xl border border-dashed border-border/70 bg-white/60 p-8 text-center text-gray-500">
                        <p>{tHome('empty')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
