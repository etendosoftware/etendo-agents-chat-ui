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
        toast({ title: "Error", description: `No se pudo crear el agente: ${error.message}` });
      } else {
        setAgents((prev) => [...prev, ...(data as Agent[])]);
        setIsCreating(false);
        setEditingAgent(null);
        toast({ title: "Agent created", description: `${agent.name} has been created successfully.` });
      }
    } else {
      const { data, error } = await supabase.from('agents').update(agentData).eq('id', agent.id).select();
      if (error) {
        toast({ title: "Error", description: `The agent could not be updated: ${error.message}` });
      } else {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? (data ? data[0] : agent) : a)));
        setEditingAgent(null);
        toast({ title: "Agent updated", description: `${agent.name} has been updated successfully.` });
      }
    }
  };

  const handleDelete = async (agentId: string) => {
    const { error } = await supabase.from('agents').delete().eq('id', agentId);
    if (error) {
      toast({ title: "Error", description: "The agent could not be removed." });
    } else {
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      toast({ title: "Agente eliminado", description: "The agent has been successfully removed." });
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
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900">Admin Panel</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4 md:p-6 bg-white shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Configured agents</h2>
              <Button onClick={startCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Agent
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
                {isCreating ? "Create new agent" : "Edit agent"}
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
          Agent name
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
          Description
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
          Webhook URL
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
          Agent Path
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
          Icon (Emoji)
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
          Access Level
        </Label>
        <Select
          value={formData.access_level}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, access_level: value as Agent['access_level'] }))
          }
        >
          <SelectTrigger id="access_level">
            <SelectValue placeholder="Selecciona un nivel de acceso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="non_client">Non Client</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-4">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="text-gray-700 hover:bg-gray-100">
          Cancel
        </Button>
      </div>
    </form>
  );
}
