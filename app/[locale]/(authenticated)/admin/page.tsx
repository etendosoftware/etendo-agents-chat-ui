import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AdminPanelClient } from './AdminPanelClient';
import { Agent } from '@/components/chat-interface';
import { getTranslations } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from '@/i18n/config';

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

export default async function AdminPage({ params }: { params: { locale: Locale } }) {
    const t = await getTranslations('admin');
    const cookieStore = cookies();
    const locale = params.locale;

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

    const { data: agents, error } = await supabase
        .from('agents')
        .select(`
            id,
            name,
            description,
            webhookurl,
            path,
            color,
            icon,
            access_level,
            agent_translations(locale, name, description),
            agent_prompts(locale, id, content, sort_order)
        `);

    if (error) {
        return <div>{t('agents.errors.loading')}</div>;
    }

    const normalizedAgents = (agents ?? []).map(agent => {
        const translationEntries = Object.fromEntries(
            locales.map(currentLocale => {
                const match = agent.agent_translations?.find((translation: any) => translation.locale === currentLocale);
                const fallbackName = currentLocale === defaultLocale ? agent.name : '';
                const fallbackDescription = currentLocale === defaultLocale ? agent.description ?? '' : '';

                return [
                    currentLocale,
                    {
                        name: match?.name ?? fallbackName,
                        description: match?.description ?? fallbackDescription,
                    },
                ];
            }),
        ) as Record<Locale, { name: string; description: string }>;

        const promptEntries = Object.fromEntries(
            locales.map(currentLocale => {
                const promptsForLocale = (agent.agent_prompts ?? [])
                    .filter((prompt: any) => prompt.locale === currentLocale)
                    .sort((a: any, b: any) => a.sort_order - b.sort_order)
                    .map((prompt: any) => ({
                        id: prompt.id as string | undefined,
                        content: prompt.content as string,
                        sort_order: prompt.sort_order as number,
                    }));

                return [currentLocale, promptsForLocale];
            }),
        ) as Record<Locale, Array<{ id?: string; content: string; sort_order: number }>>;

        return {
            id: agent.id,
            webhookurl: agent.webhookurl,
            path: agent.path,
            color: agent.color,
            icon: agent.icon,
            access_level: agent.access_level as Agent['access_level'],
            translations: translationEntries,
            prompts: promptEntries,
        };
    });

    return (
        <AdminPanelClient
            initialAgents={normalizedAgents}
            locales={locales}
            defaultLocale={defaultLocale}
            displayLocale={locale}
        />
    );
}
