
'use client'

import React from 'react';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Conversation } from "@/lib/actions/chat";
import { ConversationHistoryContent } from "./conversation-history-content-logic";
import { SidebarProvider } from './ui/sidebar';

interface SheetConversationsProps {
  initialConversations: Conversation[];
  agentPath: string;
  activeConversationId?: string;
  agentId: string;
}

export function SheetConversations({ initialConversations, agentPath, activeConversationId, agentId }: SheetConversationsProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SidebarProvider>
          <ConversationHistoryContent
            initialConversations={initialConversations}
            agentPath={agentPath}
            activeConversationId={activeConversationId}
            agentId={agentId}
          />
        </SidebarProvider>
      </SheetContent>
    </Sheet>
  );
}
