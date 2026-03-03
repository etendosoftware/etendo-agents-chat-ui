

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Conversation } from "@/lib/actions/chat";
import { Button } from "@/components/ui/button";
import { PlusIcon, Loader2, MoreHorizontal, Edit, Trash2, AlertTriangle, PencilLine } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useLocale, useTranslations } from 'next-intl';
import { useChatContext } from '@/lib/chat-context';
import { useConversationsInfinite, useDeleteConversation, useUpdateConversationTitle } from '@/hooks/use-conversations';
import { usePrefetchMessages } from '@/hooks/use-messages';
import { cn } from '@/lib/utils';

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
  initialConversations?: Conversation[];
  agentPath: string;
  activeConversationId?: string;
  agentId: string;
  chatwootInboxIdentifier?: string | null;
}

export function ConversationHistoryContent({ initialConversations, agentPath, activeConversationId, agentId, chatwootInboxIdentifier }: ConversationHistoryContentProps) {
  const locale = useLocale();
  const t = useTranslations('chat.history');
  const { navigateToConversationSoft, navigateToNewChat } = useChatContext();
  const prefetchMessages = usePrefetchMessages();
  const prefetchedConversationIdsRef = useRef<Set<string>>(new Set())

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Delete state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [conversationToEdit, setConversationToEdit] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [openMenuConversationId, setOpenMenuConversationId] = useState<string | null>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching,
  } = useConversationsInfinite(agentId, debouncedSearchTerm, initialConversations);

  const deleteMutation = useDeleteConversation(agentId);
  const updateTitleMutation = useUpdateConversationTitle(agentId);

  // Flatten pages into a single conversations array
  const conversations: Conversation[] = data?.pages.flat() ?? [];
  const isSearching = searchTerm !== debouncedSearchTerm || (isFetching && !!debouncedSearchTerm);

  const handleNewChatNavigation = useCallback(() => {
    navigateToNewChat(agentPath, locale);
  }, [navigateToNewChat, agentPath, locale]);

  const handlePrefetchConversation = useCallback((conversationId: string) => {
    if (!conversationId || conversationId === activeConversationId) {
      return
    }

    if (prefetchedConversationIdsRef.current.has(conversationId)) {
      return
    }

    prefetchedConversationIdsRef.current.add(conversationId)
    prefetchMessages(conversationId, agentId, chatwootInboxIdentifier)
  }, [activeConversationId, prefetchMessages, agentId, chatwootInboxIdentifier])

  useEffect(() => {
    prefetchedConversationIdsRef.current.clear()
  }, [agentId, chatwootInboxIdentifier])

  const groupedConversations = React.useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - 7)

    const groups: Array<{ key: 'today' | 'yesterday' | 'week' | 'older'; label: string; items: Conversation[] }> = [
      { key: 'today', label: t('groups.today'), items: [] },
      { key: 'yesterday', label: t('groups.yesterday'), items: [] },
      { key: 'week', label: t('groups.thisWeek'), items: [] },
      { key: 'older', label: t('groups.older'), items: [] },
    ]

    conversations.forEach((item) => {
      const updatedAt = new Date(item.updatedAt)
      if (updatedAt >= startOfToday) {
        groups[0].items.push(item)
      } else if (updatedAt >= startOfYesterday) {
        groups[1].items.push(item)
      } else if (updatedAt >= startOfWeek) {
        groups[2].items.push(item)
      } else {
        groups[3].items.push(item)
      }
    })

    return groups.filter((group) => group.items.length > 0)
  }, [conversations, t])

  const handleDelete = async () => {
    if (!conversationToDelete) return;

    const isActive = activeConversationId === conversationToDelete._id;

    deleteMutation.mutate(conversationToDelete._id, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success(t('toast.success'), { description: t('success.delete') });
          setIsDeleteDialogOpen(false);
          if (isActive) {
            navigateToNewChat(agentPath, locale);
          }
        } else {
          toast.error(t('toast.error'), { description: result.error });
        }
      },
      onError: () => {
        toast.error(t('toast.error'), { description: t('error.delete') });
      },
    });
  };

  const handleUpdateTitle = async () => {
    if (!conversationToEdit || !newTitle.trim()) return;

    updateTitleMutation.mutate(
      { id: conversationToEdit._id, title: newTitle },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(t('toast.success'), { description: t('success.update') });
            setIsEditDialogOpen(false);
          } else {
            toast.error(t('toast.error'), { description: result.error });
          }
        },
        onError: () => {
          toast.error(t('toast.error'), { description: t('error.update') });
        },
      }
    );
  };

  return (
    <SidebarContent className="flex h-full flex-col border-r border-sidebar-border/80 bg-sidebar text-sidebar-foreground">
      <div className="p-3 mt-12 md:mt-20">
        <Button className="w-full justify-start bg-primary text-primary-foreground hover:bg-primary/90" type="button" onClick={handleNewChatNavigation}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {t('newChat')}
        </Button>
      </div>
      <div className="px-3 pb-2">
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className='h-9 border-sidebar-border bg-white/95 text-sm'
        />
      </div>
      <SidebarGroup className="flex-1 min-h-0 flex flex-col">
        <SidebarGroupLabel className="px-3 pb-2 text-xs uppercase tracking-wide text-muted-foreground">{t('title')}</SidebarGroupLabel>
        <SidebarGroupContent className="overflow-y-auto px-2 pb-3">
          <SidebarMenu className="space-y-1">
            {isLoading || isSearching ? (
              <div className="space-y-2 p-3">
                <div className="h-8 w-full animate-pulse rounded-md bg-sidebar-accent" />
                <div className="h-8 w-[92%] animate-pulse rounded-md bg-sidebar-accent" />
                <div className="h-8 w-[84%] animate-pulse rounded-md bg-sidebar-accent" />
              </div>
            ) : (
              <>
                {groupedConversations.map((group) => (
                  <div key={group.key} className="mt-2">
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                      {group.label}
                    </p>
                    {group.items.map((item) => {
                      const cleanedTitle = item.conversationTitle
                        ? item.conversationTitle.replace(/(\n\nUser email:.*|\n\nFilesAttached:.*)/gs, "").trim()
                        : t('untitledConversation');

                      const isActive = item._id === activeConversationId;

                      return (
                        <SidebarMenuItem
                          key={item._id}
                          className="py-0.5 [content-visibility:auto] [contain-intrinsic-size:44px]"
                        >
                          <div
                            className="group/item flex w-full items-center justify-between gap-2"
                          >
                            <Tooltip delayDuration={600}>
                              <SidebarMenuButton
                                asChild
                                className={cn(
                                  "group/menu flex-1 min-w-0 rounded-lg border border-transparent px-2 py-2 pr-3 transition-colors",
                                  isActive
                                    ? "bg-primary/20 text-primary border-primary/45 shadow-sm"
                                    : "hover:bg-white/75",
                                )}
                              >
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => navigateToConversationSoft(item._id, agentPath, locale)}
                                    onMouseEnter={() => handlePrefetchConversation(item._id)}
                                    className="w-full text-left"
                                  >
                                    <span className="block truncate text-sm font-medium">{cleanedTitle}</span>
                                  </button>
                                </TooltipTrigger>
                              </SidebarMenuButton>
                              <TooltipContent side="right" className="max-w-xs break-words">
                                {cleanedTitle}
                              </TooltipContent>
                            </Tooltip>
                            <Popover
                              open={openMenuConversationId === item._id}
                              onOpenChange={(open) => setOpenMenuConversationId(open ? item._id : null)}
                            >
                              <PopoverTrigger asChild>
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-7 w-7 flex-shrink-0 rounded-md border border-transparent transition-all focus-visible:opacity-100",
                                      openMenuConversationId === item._id
                                        ? "opacity-100 bg-white/90 hover:border-sidebar-border/70"
                                        : "opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100",
                                    )}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </span>
                              </PopoverTrigger>
                              <PopoverContent align="start" sideOffset={8} className="w-52 rounded-xl border border-border/80 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm">
                                <div className="grid gap-1">
                                  <Button variant="ghost" className="h-9 w-full justify-start rounded-lg px-2 text-sm" onClick={() => { setConversationToEdit(item); setNewTitle(item.conversationTitle); setIsEditDialogOpen(true); }}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    {t('editTitle')}
                                  </Button>
                                  <Button variant="ghost" className="h-9 w-full justify-start rounded-lg px-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 focus:text-red-700" onClick={() => { setConversationToDelete(item); setIsDeleteDialogOpen(true); }}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('delete')}
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </SidebarMenuItem>
                      );
                    })}
                  </div>
                ))}

                {/* Load More Button */}
                {hasNextPage && (
                  <div className="p-2">
                    <Button
                      variant="outline"
                      className="w-full border-[#e7c514] bg-[#fad614] text-[#202452] hover:bg-[#f2cc0f] hover:text-[#202452]"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : t('loadMore')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Dialogs */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md rounded-2xl border border-red-100 bg-white/95 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              {t('deleteDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-slate-600">
              {t('deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t('deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending} className="rounded-lg bg-red-600 text-white hover:bg-red-700">
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('deleteDialog.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl border border-border/70 bg-white/95 shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <PencilLine className="h-5 w-5 text-primary" />
              {t('editDialog.title')}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{t('editDialog.description')}</p>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value.slice(0, 100))}
              placeholder={t('editDialog.placeholder')}
              className="h-11 rounded-lg"
            />
            <p className="mt-2 text-right text-xs text-muted-foreground">{newTitle.trim().length}/100</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" className="rounded-lg">{t('editDialog.cancel')}</Button>
            </DialogClose>
            <Button onClick={handleUpdateTitle} disabled={updateTitleMutation.isPending || !newTitle.trim()} className="rounded-lg">
              {updateTitleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarContent>
  )
}
