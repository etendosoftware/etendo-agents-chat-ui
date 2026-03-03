'use client'

import Link from "next/link"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { User } from "@supabase/supabase-js"
import { MoreHorizontal, LogOut, User as UserIcon, Shield, Languages, ChevronDown, Mail } from "lucide-react"
import { Button } from "./ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuGroup, DropdownMenuLabel } from "./ui/dropdown-menu"
import { SheetConversations } from "./sheet-conversations"
import { Conversation } from "@/lib/actions/chat";
import { useMounted } from "@/hooks/use-mounted";
import { Agent } from "./chat-interface";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

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
  const locale = useLocale();
  const localePrefix = `/${locale}`;
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const languageOptions = [
    { value: 'en', label: t('navigation.english'), flag: '/flags/en.svg' },
    { value: 'es', label: t('navigation.spanish'), flag: '/flags/es.png' },
  ];

  const handleLocaleChange = (nextLocale: string) => {
    if (!pathname || nextLocale === locale) {
      return;
    }

    const segments = pathname.split('/');

    if (segments.length > 1) {
      segments[1] = nextLocale;
    } else {
      segments.push(nextLocale);
    }

    const newPath = segments.join('/') || `/${nextLocale}`;
    const query = searchParams?.toString();
    const href = query ? `${newPath}?${query}` : newPath;

    router.push(href);
  };

  const LanguageSelect = ({ inDropdown = false, size = 'default' }: { inDropdown?: boolean, size?: 'sm' | 'default' }) => (
    <Select value={locale} onValueChange={handleLocaleChange}>
      <SelectTrigger
        size={size}
        aria-label={t('navigation.language')}
        className={"h-10 w-full justify-start gap-2 rounded-lg border-none bg-transparent px-2 shadow-none"}
      >
        {inDropdown && <Languages className="w-4 h-4" />}
        <SelectValue placeholder={t('navigation.language')} />
      </SelectTrigger>
      <SelectContent align="end">
        {languageOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <Image
                src={option.flag}
                alt={`${option.label} flag`}
                width={20}
                height={14}
                className="h-5 w-5 rounded-full object-cover shadow-sm"
              />
              <span className="text-sm font-medium">{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <header className="relative z-20 border-b border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
      <nav className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {!disableHamburgerMenu && mounted && user && (
            <div className="md:hidden">
              <SheetConversations
                initialConversations={initialConversations}
                agentPath={agentPath!}
                activeConversationId={activeConversationId}
                agentId={agentId!}
                chatwootInboxIdentifier={agent?.chatwoot_inbox_identifier}
              />
            </div>
          )}
          {/* Logo */}
          <Button asChild variant="link" className="flex items-center px-0 gap-2">
            <Link href={localePrefix}>
              <Image
                src={"/logo-etendo.png"}
                alt="Etendo Logo"
                className="w-8 h-8"
                height={40}
                width={40}
              />
              <span className="hidden text-slate-800 md:block md:font-medium">{t('navigation.home')}</span>
            </Link>
          </Button>
        </div>

        {/* Desktop buttons */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-100/70 cursor-pointer">
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
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl border border-border/80 bg-white/95 p-2 shadow-xl backdrop-blur-sm">
                <DropdownMenuLabel className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {user.user_metadata?.avatar_url ? (
                        <AvatarImage src={user.user_metadata.avatar_url as string} alt={user.email || "User Avatar"} />
                      ) : (
                        <AvatarFallback>{user.email?.charAt(0)?.toUpperCase()}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('account.label')}</p>
                      <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {userRole === "admin" && (
                    <DropdownMenuItem asChild className="h-10 rounded-lg">
                      <Link href={`${localePrefix}/admin`} className="flex items-center gap-2 text-sm">
                        <Shield className="w-4 h-4" />
                        {t('navigation.adminPanel')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="h-10 rounded-lg p-0" onSelect={(e) => e.preventDefault()}>
                    <LanguageSelect inDropdown />
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="hover:bg-transparent">
                  <form action={`${localePrefix}/auth/signout`} method="post" className="w-full hover:bg-transparent focus:bg-transparent">
                    <button type="submit" className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 cursor-pointer">
                      <LogOut className="w-4 h-4" />
                      {t('navigation.logout')}
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <LanguageSelect />
              {!isPublicAgent && (
                <Button asChild>
                  <Link href={`${localePrefix}/auth/login`}>
                    {t('navigation.login')}
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>

        {/* Mobile menu */}
        <div className="md:hidden flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="size-9">
                  <MoreHorizontal className="h-6 w-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl border border-border/80 bg-white/95 p-2 shadow-xl backdrop-blur-sm">
                {user ? (
                  <>
                    <DropdownMenuLabel className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate text-sm">{user.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {userRole === "admin" && (
                      <DropdownMenuItem asChild className="h-10 rounded-lg">
                        <Link href={`${localePrefix}/admin`} className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          {t('navigation.adminPanel')}
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="h-10 rounded-lg p-0" onSelect={(e) => e.preventDefault()}>
                       <LanguageSelect inDropdown />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <form action={`${localePrefix}/auth/signout`} method="post" className="w-full hover:bg-transparent focus:bg-transparent">
                        <button type="submit" className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 cursor-pointer">
                          <LogOut className="w-4 h-4" />
                          {t('navigation.logout')}
                        </button>
                      </form>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem className="p-0" onSelect={(e) => e.preventDefault()}>
                       <LanguageSelect inDropdown />
                    </DropdownMenuItem>
                    {!isPublicAgent && (
                      <DropdownMenuItem asChild>
                        <Link href={`${localePrefix}/auth/login`} className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          {t('navigation.login')}
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </nav>
    </header>
  )
}
