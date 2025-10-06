'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Edit, Trash2, Save } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useTranslations } from 'next-intl';

interface Agent {
  id: string;
  name: string;
  description: string;
  webhookurl: string;
  path: string;
  color: string;
  icon: string;
  access_level: 'public' | 'non_client' | 'partner' | 'admin';
}

interface AdminPanelClientProps {
  initialAgents: Agent[];
}

export function AdminPanelClient({ initialAgents }: AdminPanelClientProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('admin');

  const handleSave = async (agent: Agent) => {
    const agentData = {
      name: agent.name,
      description: agent.description,
      webhookurl: agent.webhookurl,
      path: agent.path,
      color: agent.color,
      icon: agent.icon,
      access_level: agent.access_level,
    };

    if (isCreating) {
      const { data, error } = await supabase.from('agents').insert([agentData]).select();
      if (error) {
        toast({ title: t('toast.error'), description: t('agents.errors.create', { message: error.message }) });
      } else {
        setAgents((prev) => [...prev, ...(data as Agent[])]);
        setIsCreating(false);
        setEditingAgent(null);
        toast({ title: t('toast.agentCreated'), description: t('agents.success.create', { name: agent.name }) });
      }
    } else {
      const { data, error } = await supabase.from('agents').update(agentData).eq('id', agent.id).select();
      if (error) {
        toast({ title: t('toast.error'), description: t('agents.errors.update', { message: error.message }) });
      } else {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? (data ? data[0] : agent) : a)));
        setEditingAgent(null);
        toast({ title: t('toast.agentUpdated'), description: t('agents.success.update', { name: agent.name }) });
      }
    }
  };

  const handleDelete = async (agentId: string) => {
    const { error } = await supabase.from('agents').delete().eq('id', agentId);
    if (error) {
      toast({ title: t('toast.error'), description: t('agents.errors.delete') });
    } else {
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      toast({ title: t('toast.agentDeleted'), description: t('agents.success.delete') });
    }
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingAgent({
      id: "",
      name: "",
      description: "",
      webhookurl: "",
      path: "/",
      color: "agent-support",
      icon: "🤖",
      access_level: 'public',
    });
  };

  return (
    <main className="p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900">{t('title')}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4 md:p-6 bg-white shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-xl md:text-2xl font-semibold text-gray-900">{t('agents.title')}</h2>
              <Button onClick={startCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                {t('agents.new')}
              </Button>
            </div>

            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{agent.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                        <p className="text-sm text-gray-600">{agent.path}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingAgent(agent)}
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
              ))}
            </div>
          </Card>

          {editingAgent && (
            <Card className="p-4 md:p-6 bg-white shadow-lg">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                {isCreating ? t('agents.create') : t('agents.edit')}
              </h2>

              <AgentEditor
                agent={editingAgent}
                onSave={handleSave}
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
  agent: Agent;
  onSave: (agent: Agent) => void;
  onCancel: () => void;
}

function AgentEditor({ agent, onSave, onCancel }: AgentEditorProps) {
  const [formData, setFormData] = useState(agent);
  const t = useTranslations('admin.editor');

  useEffect(() => {
    setFormData(agent);
  }, [agent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name" className="text-gray-900 font-medium">
          {t('name')}
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label htmlFor="description" className="text-gray-900 font-.medium">
          {t('description')}
        </Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label htmlFor="webhookurl" className="text-gray-900 font-medium">
          {t('webhookUrl')}
        </Label>
        <Input
          id="webhookurl"
          value={formData.webhookurl}
          onChange={(e) => setFormData((prev) => ({ ...prev, webhookurl: e.target.value }))}
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
          onChange={(e) => setFormData((prev) => ({ ...prev, path: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label htmlFor="icon" className="text-gray-900 font-medium">
          {t('icon')}
        </Label>
        <Input
          id="icon"
          value={formData.icon}
          onChange={(e) => setFormData((prev) => ({ ...prev, icon: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label htmlFor="access_level" className="text-gray-900 font-medium">
          {t('accessLevel.label')}
        </Label>
        <Select
          value={formData.access_level}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, access_level: value as Agent['access_level'] }))
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

