'use client'

import Link from "next/link"
import { Button } from "./ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import Image from "next/image"
import { User } from "@supabase/supabase-js"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "./ui/dropdown-menu"
import { MoreHorizontal, LogOut, User as UserIcon, Shield } from "lucide-react"
import { SheetConversations } from "./sheet-conversations"
import { Conversation } from "@/lib/actions/chat";
import { useMounted } from "@/hooks/use-mounted";
import { Agent } from "./chat-interface";

interface GlobalHeaderProps {
  user: User | null;
  userRole: string | null;
  initialConversations?: Conversation[];
  agentPath?: string;
  activeConversationId?: string;
  agentId?: string;
  disableHamburgerMenu?: boolean;
  agent?: Agent;
}

export function GlobalHeader({ user, userRole, initialConversations, agentPath, activeConversationId, agentId, disableHamburgerMenu, agent }: GlobalHeaderProps) {
  const mounted = useMounted();
  const isPublicAgent = agent?.access_level === 'public';

  return (
    <header className="relative z-20 bg-gradient-custom dark:bg-gray-800 p-4 shadow-md border-b border-gray-300 dark:border-gray-700">
      <nav className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {!disableHamburgerMenu && mounted && user && (
            <div className="md:hidden">
              <SheetConversations
                initialConversations={initialConversations!}
                agentPath={agentPath!}
                activeConversationId={activeConversationId}
                agentId={agentId!}
              />
            </div>
          )}
          {/* Logo */}
          <Link href="/">
            <Button variant="link" className="flex items-center px-0 gap-2">
              <Image
                src={"/logo-etendo.png"}
                alt="Etendo Logo"
                className="w-8 h-8"
                height={40}
                width={40}
              />
              <span className="font-semibold hidden md:block">Home</span>
            </Button>
          </Link>
        </div>

        {/* Desktop buttons */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              {userRole === "admin" && (
                <Link href="/admin">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    Admin Panel
                  </Button>
                </Link>
              )}
              <Avatar>
                {user.user_metadata?.avatar_url ? (
                  <AvatarImage
                    src={user.user_metadata.avatar_url as string}
                    alt={user.email || "User Avatar"}
                  />
                ) : (
                  <AvatarFallback>
                    {user.email?.charAt(0)?.toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <form action="/auth/signout" method="post">
                <Button type="submit">Logout</Button>
              </form>
            </>
          ) : (
            !isPublicAgent && (
              <Link href="/auth/login">
                <Button>Login</Button>
              </Link>
            )
          )}
        </div>

        {/* Mobile menu */}
        <div className="md:hidden">
          { !(!user && isPublicAgent) && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                  <MoreHorizontal className="h-6 w-6" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-effect w-56">
                {user ? (
                  <>
                    <DropdownMenuItem className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {user.user_metadata?.avatar_url ? (
                          <AvatarImage
                            src={user.user_metadata.avatar_url as string}
                            alt={user.email || "User Avatar"}
                          />
                        ) : (
                          <AvatarFallback>
                            {user.email?.charAt(0)?.toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="truncate">{user.email}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {userRole === "admin" && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <form action="/auth/signout" method="post" className="w-full">
                        <button type="submit" className="w-full text-left flex items-center gap-2">
                          <LogOut className="w-4 h-4" />
                          Logout
                        </button>
                      </form>
                    </DropdownMenuItem>
                  </>
                ) : (
                  !isPublicAgent && (
                    <DropdownMenuItem asChild>
                      <Link href="/auth/login" className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4" />
                        Login
                      </Link>
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </nav>
    </header>
  )
}



