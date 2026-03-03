
import { Sidebar } from "@/components/ui/sidebar";
import { ConversationHistoryContent } from "./conversation-history-content-logic";
import { Conversation } from "@/lib/actions/chat";

interface ConversationHistoryProps {
  initialConversations?: Conversation[];
  agentPath: string;
  activeConversationId?: string;
  agentId: string;
  chatwootInboxIdentifier?: string | null;
}

export function SidebarConversations({ initialConversations, agentPath, activeConversationId, agentId, chatwootInboxIdentifier }: ConversationHistoryProps) {
  return (
    <Sidebar>
      <ConversationHistoryContent
        initialConversations={initialConversations}
        agentPath={agentPath}
        activeConversationId={activeConversationId}
        agentId={agentId}
        chatwootInboxIdentifier={chatwootInboxIdentifier}
      />
    </Sidebar>
  )
}
