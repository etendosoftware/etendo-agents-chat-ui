"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Save, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";

type AccessLevel = "public" | "non_client" | "partner" | "admin";

interface AgentTranslation {
  name: string;
  description: string;
}

type AgentTranslations = Record<Locale, AgentTranslation>;

interface AgentPrompt {
  id?: string;
  content: string;
  sort_order: number;
}

type AgentPrompts = Record<Locale, AgentPrompt[]>;

interface AdminAgent {
  id: string;
  webhookurl: string;
  path: string;
  color: string;
  icon: string;
  access_level: AccessLevel;
  requires_email: boolean;
  chatwoot_inbox_identifier: string;
  translations: AgentTranslations;
  prompts: AgentPrompts;
}

interface AdminPanelClientProps {
  initialAgents: AdminAgent[];
  locales: Locale[];
  defaultLocale: Locale;
  displayLocale: Locale;
}

const createEmptyTranslations = (localeList: Locale[]): AgentTranslations =>
  localeList.reduce((acc, locale) => {
    acc[locale] = { name: "", description: "" };
    return acc;
  }, {} as AgentTranslations);

const cloneTranslations = (translations: AgentTranslations, localeList: Locale[]): AgentTranslations =>
  localeList.reduce((acc, locale) => {
    const source = translations?.[locale];
    acc[locale] = {
      name: source?.name ?? "",
      description: source?.description ?? "",
    };
    return acc;
  }, {} as AgentTranslations);

const createEmptyPrompts = (localeList: Locale[]): AgentPrompts =>
  localeList.reduce((acc, locale) => {
    acc[locale] = [];
    return acc;
  }, {} as AgentPrompts);

const clonePrompts = (prompts: AgentPrompts, localeList: Locale[]): AgentPrompts =>
  localeList.reduce((acc, locale) => {
    const sourceList = prompts?.[locale] ?? [];
    acc[locale] = sourceList.map((prompt) => ({ ...prompt }));
    return acc;
  }, {} as AgentPrompts);

export function AdminPanelClient({ initialAgents, locales, defaultLocale, displayLocale }: AdminPanelClientProps) {
  const { toast } = useToast();
  const t = useTranslations('admin');
  const [agents, setAgents] = useState<AdminAgent[]>(initialAgents);
  const [editingAgent, setEditingAgent] = useState<AdminAgent | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const getDisplayTranslation = (agent: AdminAgent) => {
    const current = agent.translations[displayLocale];
    if (current?.name?.trim()) {
      return current;
    }
    return agent.translations[defaultLocale] ?? { name: '', description: '' };
  };

  const prepareAgentForEditing = (agent: AdminAgent): AdminAgent => ({
    ...agent,
    translations: cloneTranslations(agent.translations, locales),
    prompts: clonePrompts(agent.prompts, locales),
  });

  const upsertTranslations = async (agentId: string, translations: AgentTranslations) =>
    supabase
      .from('agent_translations')
      .upsert(
        locales.map((locale) => ({
          agent_id: agentId,
          locale,
          name: translations[locale]?.name ?? '',
          description: translations[locale]?.description ?? '',
        })),
        { onConflict: 'agent_id,locale' },
      );

  const preparePromptPayload = (agentId: string, prompts: AgentPrompts) =>
    locales.flatMap((locale) =>
      (prompts[locale] ?? [])
        .map((prompt, index) => ({
          agent_id: agentId,
          locale,
          content: prompt.content.trim(),
          sort_order: index,
        }))
        .filter((prompt) => prompt.content.length > 0),
    );

  const handleSave = async (agent: AdminAgent) => {
    const defaultTranslation = agent.translations[defaultLocale];
    if (!defaultTranslation?.name?.trim()) {
      toast({ title: t('toast.error'), description: t('agents.errors.nameRequired') });
      return;
    }

  const agentPayload = {
    name: defaultTranslation.name,
    description: defaultTranslation.description,
    webhookurl: agent.webhookurl,
    path: agent.path,
    color: agent.color,
    icon: agent.icon,
    access_level: agent.access_level,
    requires_email: agent.requires_email,
    chatwoot_inbox_identifier: agent.chatwoot_inbox_identifier || null,
  };

    if (isCreating) {
      const { data: createdAgents, error: createError } = await supabase
        .from('agents')
        .insert([agentPayload])
        .select();

      const createdAgent = createdAgents?.[0];

      if (createError || !createdAgent) {
        toast({
          title: t('toast.error'),
          description: t('agents.errors.create', { message: createError?.message ?? 'unknown' }),
        });
        return;
      }

      const { error: translationError } = await upsertTranslations(createdAgent.id, agent.translations);
      if (translationError) {
        toast({
          title: t('toast.error'),
          description: t('agents.errors.update', { message: translationError.message }),
        });
        return;
      }

      const promptPayload = preparePromptPayload(createdAgent.id, agent.prompts);
      if (promptPayload.length > 0) {
        const { error: promptInsertError } = await supabase.from('agent_prompts').insert(promptPayload);
        if (promptInsertError) {
          toast({
            title: t('toast.error'),
            description: t('agents.errors.update', { message: promptInsertError.message }),
          });
          return;
        }
      }

      const normalizedAgent: AdminAgent = {
        id: createdAgent.id,
        webhookurl: agent.webhookurl,
        path: agent.path,
        color: agent.color,
        icon: agent.icon,
        access_level: agent.access_level,
        requires_email: agent.requires_email,
        chatwoot_inbox_identifier: agent.chatwoot_inbox_identifier,
        translations: cloneTranslations(agent.translations, locales),
        prompts: clonePrompts(agent.prompts, locales),
      };

      setAgents((prev) => [...prev, normalizedAgent]);
      setIsCreating(false);
      setEditingAgent(null);
      toast({ title: t('toast.agentCreated'), description: t('agents.success.create', { name: defaultTranslation.name }) });
    } else {
      const { data: updatedAgents, error: updateError } = await supabase
        .from('agents')
        .update(agentPayload)
        .eq('id', agent.id)
        .select();

      const updatedAgent = updatedAgents?.[0];

      if (updateError || !updatedAgent) {
        toast({
          title: t('toast.error'),
          description: t('agents.errors.update', { message: updateError?.message ?? 'unknown' }),
        });
        return;
      }

      const { error: translationError } = await upsertTranslations(agent.id, agent.translations);
      if (translationError) {
        toast({
          title: t('toast.error'),
          description: t('agents.errors.update', { message: translationError.message }),
        });
        return;
      }

      const promptPayload = preparePromptPayload(agent.id, agent.prompts);
      const { error: promptDeleteError } = await supabase.from('agent_prompts').delete().eq('agent_id', agent.id);
      if (promptDeleteError) {
        toast({
          title: t('toast.error'),
          description: t('agents.errors.update', { message: promptDeleteError.message }),
        });
        return;
      }

      if (promptPayload.length > 0) {
        const { error: promptInsertError } = await supabase.from('agent_prompts').insert(promptPayload);
        if (promptInsertError) {
          toast({
            title: t('toast.error'),
            description: t('agents.errors.update', { message: promptInsertError.message }),
          });
          return;
        }
      }

      const normalizedAgent: AdminAgent = {
        id: agent.id,
        webhookurl: agent.webhookurl,
        path: agent.path,
        color: agent.color,
        icon: agent.icon,
        access_level: agent.access_level,
        requires_email: agent.requires_email,
        chatwoot_inbox_identifier: agent.chatwoot_inbox_identifier,
        translations: cloneTranslations(agent.translations, locales),
        prompts: clonePrompts(agent.prompts, locales),
      };

      setAgents((prev) => prev.map((item) => (item.id === agent.id ? normalizedAgent : item)));
      setEditingAgent(null);
      toast({ title: t('toast.agentUpdated'), description: t('agents.success.update', { name: defaultTranslation.name }) });
    }
  };

  const handleDelete = async (agentId: string) => {
    const { error } = await supabase.from('agents').delete().eq('id', agentId);
    if (error) {
      toast({ title: t('toast.error'), description: t('agents.errors.delete') });
    } else {
      setAgents((prev) => prev.filter((agent) => agent.id !== agentId));
      toast({ title: t('toast.agentDeleted'), description: t('agents.success.delete') });
    }
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingAgent({
      id: '',
      webhookurl: '',
      path: '/',
      color: 'agent-support',
      icon: '🤖',
      access_level: 'public',
      requires_email: false,
      chatwoot_inbox_identifier: '',
      translations: createEmptyTranslations(locales),
      prompts: createEmptyPrompts(locales),
    });
  };

  return (
    <main className="p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-gray-900">{t('title')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-[80vh]">
        <Card className="p-4 md:p-6 bg-white shadow-lg overflow-y-scroll">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 className="text-xl md:text-2xl font-semibold text-gray-900">{t('agents.title')}</h2>
            <Button onClick={startCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              {t('agents.new')}
            </Button>
          </div>

          <div className="space-y-4">
            {agents.map((agent) => {
              const translation = getDisplayTranslation(agent);
              return (
                <div key={agent.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{agent.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{translation.name || '—'}</h3>
                        <p className="text-sm text-gray-600">{agent.path}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingAgent(prepareAgentForEditing(agent));
                          setIsCreating(false);
                        }}
                        className="text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(agent.id)}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {editingAgent && (
          <Card className="p-4 md:p-6 bg-white shadow-lg overflow-y-auto">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              {isCreating ? t('agents.create') : t('agents.edit')}
            </h2>

            <AgentEditor
              agent={editingAgent}
              locales={locales}
              defaultLocale={defaultLocale}
              onSave={async (updatedAgent) => {
                await handleSave(updatedAgent);
              }}
              onCancel={() => {
                setEditingAgent(null);
                setIsCreating(false);
              }}
            />
          </Card>
        )}
      </div>
    </main>
  );
}

interface AgentEditorProps {
  agent: AdminAgent;
  locales: Locale[];
  defaultLocale: Locale;
  onSave: (agent: AdminAgent) => void;
  onCancel: () => void;
}

function AgentEditor({ agent, locales, defaultLocale, onSave, onCancel }: AgentEditorProps) {
  const [formData, setFormData] = useState<AdminAgent>(() => ({
    ...agent,
    translations: cloneTranslations(agent.translations, locales),
    prompts: clonePrompts(agent.prompts, locales),
  }));
  const t = useTranslations('admin.editor');

  useEffect(() => {
    setFormData({
      ...agent,
      translations: cloneTranslations(agent.translations, locales),
      prompts: clonePrompts(agent.prompts, locales),
    });
  }, [agent, locales]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave(formData);
  };

  const updateTranslation = (locale: Locale, field: keyof AgentTranslation, value: string) => {
    setFormData((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [locale]: {
          ...prev.translations[locale],
          [field]: value,
        },
      },
    }));
  };

  const updatePrompts = (locale: Locale, updater: (current: AgentPrompt[]) => AgentPrompt[]) => {
    setFormData((prev) => {
      const current = prev.prompts[locale] ?? [];
      const updated = updater(current).map((prompt, index) => ({
        ...prompt,
        sort_order: index,
      }));

      return {
        ...prev,
        prompts: {
          ...prev.prompts,
          [locale]: updated,
        },
      };
    });
  };

  const addPrompt = (locale: Locale) => {
    updatePrompts(locale, (current) => [...current, { content: '', sort_order: current.length }]);
  };

  const updatePromptContent = (locale: Locale, index: number, value: string) => {
    updatePrompts(locale, (current) =>
      current.map((prompt, idx) => (idx === index ? { ...prompt, content: value } : prompt)),
    );
  };

  const movePrompt = (locale: Locale, index: number, direction: -1 | 1) => {
    updatePrompts(locale, (current) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= current.length) {
        return current;
      }
      const updated = [...current];
      const [item] = updated.splice(index, 1);
      updated.splice(newIndex, 0, item);
      return updated;
    });
  };

  const removePrompt = (locale: Locale, index: number) => {
    updatePrompts(locale, (current) => current.filter((_, idx) => idx !== index));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label className="text-gray-900 font-medium">{t('translations')}</Label>
        <Tabs defaultValue={locales[0]} className="space-y-4">
          <TabsList>
            {locales.map((locale) => (
              <TabsTrigger key={locale} value={locale}>
                {locale.toUpperCase()} {locale === defaultLocale ? '•' : ''}
              </TabsTrigger>
            ))}
          </TabsList>
          {locales.map((locale) => (
            <TabsContent key={locale} value={locale} className="space-y-4">
              <div>
                <Label htmlFor={`name-${locale}`} className="text-gray-900 font-medium">
                  {t('name')} ({locale.toUpperCase()})
                </Label>
                <Input
                  id={`name-${locale}`}
                  value={formData.translations[locale]?.name ?? ''}
                  onChange={(event) => updateTranslation(locale, 'name', event.target.value)}
                  required={locale === defaultLocale}
                />
              </div>
              <div>
                <Label htmlFor={`description-${locale}`} className="text-gray-900 font-medium">
                  {t('description')} ({locale.toUpperCase()})
                </Label>
                <Textarea
                  id={`description-${locale}`}
                  value={formData.translations[locale]?.description ?? ''}
                  onChange={(event) => updateTranslation(locale, 'description', event.target.value)}
                  required={locale === defaultLocale}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-medium">{t('prompts.title')} ({locale.toUpperCase()})</Label>
                {formData.prompts[locale] && formData.prompts[locale].length > 0 ? (
                  <div className="space-y-3">
                    {formData.prompts[locale].map((prompt, index) => (
                      <div key={`prompt-${locale}-${index}`} className="flex items-start gap-2">
                        <Textarea
                          id={`prompt-${locale}-${index}`}
                          value={prompt.content}
                          onChange={(event) => updatePromptContent(locale, index, event.target.value)}
                          aria-label={t('prompts.itemLabel', { index: index + 1, locale: locale.toUpperCase() })}
                          placeholder={t('prompts.placeholder')}
                          className="flex-1"
                        />
                        <div className="flex flex-col gap-1 pt-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => movePrompt(locale, index, -1)}
                            disabled={index === 0}
                            aria-label={t('prompts.moveUp')}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => movePrompt(locale, index, 1)}
                            disabled={index === (formData.prompts[locale]?.length ?? 0) - 1}
                            aria-label={t('prompts.moveDown')}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => removePrompt(locale, index)}
                            aria-label={t('prompts.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('prompts.empty')}</p>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => addPrompt(locale)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('prompts.add')}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div>
        <Label htmlFor="webhookurl" className="text-gray-900 font-medium">
          {t('webhookUrl')}
        </Label>
        <Input
          id="webhookurl"
          value={formData.webhookurl}
          onChange={(event) => setFormData((prev) => ({ ...prev, webhookurl: event.target.value }))}
          required
        />
      </div>

      <div>
        <Label htmlFor="path" className="text-gray-900 font-medium">
          {t('path')}
        </Label>
        <Input
          id="path"
          value={formData.path}
          onChange={(event) => setFormData((prev) => ({ ...prev, path: event.target.value }))}
          required
        />
      </div>

      <div>
        <Label htmlFor="chatwoot_inbox_identifier" className="text-gray-900 font-medium">
          {t('chatwootInboxIdentifier.label')}
        </Label>
        <Input
          id="chatwoot_inbox_identifier"
          value={formData.chatwoot_inbox_identifier}
          onChange={(event) => setFormData((prev) => ({ ...prev, chatwoot_inbox_identifier: event.target.value }))}
          placeholder={t('chatwootInboxIdentifier.placeholder')}
        />
        <p className="text-sm text-muted-foreground mt-1">
          {t('chatwootInboxIdentifier.help')}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="requires_email" className="text-gray-900 font-medium">
            {t('requiresEmail.label')}
          </Label>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            {t('requiresEmail.help')}
          </p>
        </div>
        <Switch
          id="requires_email"
          checked={formData.requires_email}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, requires_email: checked }))
          }
        />
      </div>

      <div>
        <Label htmlFor="icon" className="text-gray-900 font-medium">
          {t('icon')}
        </Label>
        <Input
          id="icon"
          value={formData.icon}
          onChange={(event) => setFormData((prev) => ({ ...prev, icon: event.target.value }))}
          required
        />
      </div>

      <div>
        <Label htmlFor="color" className="text-gray-900 font-medium">
          {t('color')}
        </Label>
        <Input
          id="color"
          value={formData.color}
          onChange={(event) => setFormData((prev) => ({ ...prev, color: event.target.value }))}
        />
      </div>

      <div>
        <Label htmlFor="access_level" className="text-gray-900 font-medium">
          {t('accessLevel.label')}
        </Label>
        <Select
          value={formData.access_level}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, access_level: value as AccessLevel }))
          }
        >
          <SelectTrigger id="access_level">
            <SelectValue placeholder={t('accessLevel.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">{t('accessLevel.options.public')}</SelectItem>
            <SelectItem value="non_client">{t('accessLevel.options.non_client')}</SelectItem>
            <SelectItem value="partner">{t('accessLevel.options.partner')}</SelectItem>
            <SelectItem value="admin">{t('accessLevel.options.admin')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Save className="w-4 h-4 mr-2" />
          {t('save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="text-gray-700 hover:bg-gray-100">
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
