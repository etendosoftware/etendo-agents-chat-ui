

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Conversation } from "@/lib/actions/chat";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon, Loader2, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { fetchConversations } from '@/lib/actions/conversations';
import { getSingleConversation } from '@/lib/actions/getSingleConversation';
import { deleteConversation } from '@/lib/actions/deleteConversation';
import { updateConversationTitle } from '@/lib/actions/updateConversationTitle';
import { useToast } from "@/components/ui/use-toast";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

interface ConversationHistoryContentProps {
  initialConversations: Conversation[];
  agentPath: string;
  activeConversationId?: string;
  agentId: string;
}

export function ConversationHistoryContent({ initialConversations, agentPath, activeConversationId, agentId }: ConversationHistoryContentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [conversations, setConversations] = useState(initialConversations);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialConversations.length === 10);

  // Delete state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [conversationToEdit, setConversationToEdit] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Effect to reset page when search term changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm]);

  // Main effect for fetching conversations
  useEffect(() => {
    setIsLoading(true);
    fetchConversations(agentId, { searchTerm: debouncedSearchTerm, page, limit: 10 }).then(async (newConversations) => {
      let finalConversations = newConversations;

      // If on page 1 and there's an active convo that is NOT in the list
      if (page === 1 && activeConversationId && !newConversations.some(c => c._id === activeConversationId)) {
        const activeConvo = await getSingleConversation(activeConversationId);
        if (activeConvo) {
          // Add the active convo to the top, and remove it if it somehow exists deeper in the array
          finalConversations = [activeConvo, ...newConversations.filter(c => c._id !== activeConversationId)];
        }
      }

      if (page === 1) {
        setConversations(finalConversations);
      } else {
        // When paginating, filter out any conversations that might already be in the list
        // (specifically the active one we may have prepended).
        setConversations(prev => {
          const existingIds = new Set(prev.map(c => c._id));
          const uniqueNewConversations = newConversations.filter(c => !existingIds.has(c._id));
          return [...prev, ...uniqueNewConversations];
        });
      }
      
      setHasMore(newConversations.length === 10); // Base hasMore on the original fetch
      setIsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearchTerm, agentId, activeConversationId]);

  // This useEffect is to add the "New chat" item client-side if not viewing an active conversation
  const displayConversations = React.useMemo(() => {
    if (activeConversationId === undefined && !isLoading) {
      const hasNewChat = conversations.some(c => c._id === 'new-chat');
      if (!hasNewChat) {
        return [
          { _id: 'new-chat', conversationTitle: 'New chat', agentId: '', sessionId: '', email: '', createdAt: new Date(), updatedAt: new Date() } as Conversation,
          ...conversations
        ];
      }
    }
    return conversations;
  }, [conversations, activeConversationId, isLoading]);

  


  const handleDelete = async () => {
    if (!conversationToDelete) return;
    setIsDeleting(true);
    const result = await deleteConversation(conversationToDelete._id);
    setIsDeleting(false);

    if (result.success) {
      setConversations(prev => prev.filter(c => c._id !== conversationToDelete._id));
      toast({ title: "Success", description: "Conversation deleted." });
      setIsDeleteDialogOpen(false);
      if (activeConversationId === conversationToDelete._id) {
        router.push(`/chat/${agentPath}`);
      }
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error });
    }
  };

  const handleUpdateTitle = async () => {
    if (!conversationToEdit || !newTitle.trim()) return;
    setIsUpdating(true);
    const result = await updateConversationTitle(conversationToEdit._id, newTitle);
    setIsUpdating(false);

    if (result.success) {
      setConversations(prev => prev.map(c => c._id === conversationToEdit._id ? { ...c, conversationTitle: newTitle } : c));
      toast({ title: "Success", description: "Title updated." });
      setIsEditDialogOpen(false);
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error });
    }
  };

  return (
    <SidebarContent className="flex flex-col h-full bg-gradient-custom">
      <div className="p-2 mt-12 md:mt-24">
        <Link href={`/chat/${agentPath}`} className="w-full">
          <Button className="w-full justify-start">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </Link>
      </div>
      <div className="p-2">
        <Input
          placeholder="Search conversations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className='border-gray-400 text-sm md:text-md'
        />
      </div>
      <SidebarGroup className="flex-1 min-h-0 flex flex-col">
        <SidebarGroupLabel className="text-2xl py-4 border-b border-gray-300">History</SidebarGroupLabel>
        <SidebarGroupContent className="pt-4 overflow-y-auto">
          <SidebarMenu>
            {displayConversations.map((item, index) => {
              const cleanedTitle = item.conversationTitle
                ? item.conversationTitle.replace(/(\n\nUser email:.*|\n\nFilesAttached:.*)/gs, "").trim()
                : "New Chat";

              const isActive = item._id === activeConversationId || (item._id === 'new-chat' && activeConversationId === undefined);

              return (
                <SidebarMenuItem key={item._id}>
                  <div className="flex items-center justify-between w-full group">
                    <SidebarMenuButton asChild className={`${isActive ? "bg-indigo-300 hover:bg-indigo-200" : "hover:bg-indigo-200"} flex-1 w-0`}>
                      <Link href={item._id === 'new-chat' ? `/chat/${agentPath}` : `/chat/${agentPath}/${item._id}`} className="truncate">
                        <span>{cleanedTitle}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item._id !== 'new-chat' && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1">
                          <div className="grid gap-1">
                            <Button variant="ghost" className="w-full justify-start text-sm p-2" onClick={() => { setConversationToEdit(item); setNewTitle(item.conversationTitle); setIsEditDialogOpen(true); }}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Title
                            </Button>
                            <Button variant="ghost" className="w-full justify-start text-sm p-2 text-red-500 hover:text-red-600 focus:text-red-600" onClick={() => { setConversationToDelete(item); setIsDeleteDialogOpen(true); }}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </SidebarMenuItem>
              );
            })}
            
            {/* Load More Button */}
            {!isLoading && hasMore && (
              <div className="p-2">
                <Button variant="outline" className="w-full" onClick={() => setPage(prev => prev + 1)}>
                  Load More
                </Button>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center items-center p-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Dialogs */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit conversation title</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Enter new title" />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleUpdateTitle} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarContent>
  )
}