'use client'

import Link from "next/link"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { User } from "@supabase/supabase-js"
import { MoreHorizontal, LogOut, User as UserIcon, Shield, Languages, ChevronDown } from "lucide-react"
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
        className={"w-full justify-start gap-2 border-none"}
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
          <Link href={localePrefix}>
            <Button variant="link" className="flex items-center px-0 gap-2">
              <Image
                src={"/logo-etendo.png"}
                alt="Etendo Logo"
                className="w-8 h-8"
                height={40}
                width={40}
              />
              <span className="font-semibold hidden md:block">{t('navigation.home')}</span>
            </Button>
          </Link>
        </div>

        {/* Desktop buttons */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-0 rounded-full cursor-pointer">
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
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {userRole === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href={`${localePrefix}/admin`} className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        {t('navigation.adminPanel')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="p-0" onSelect={(e) => e.preventDefault()}>
                    <LanguageSelect inDropdown />
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action={`${localePrefix}/auth/signout`} method="post" className="w-full">
                    <button type="submit" className="w-full text-left flex items-center gap-2">
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
                <Link href={`${localePrefix}/auth/login`}>
                  <Button>{t('navigation.login')}</Button>
                </Link>
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
              <DropdownMenuContent align="end" className="w-56">
                {user ? (
                  <>
                    <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {userRole === "admin" && (
                      <DropdownMenuItem asChild>
                        <Link href={`${localePrefix}/admin`} className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          {t('navigation.adminPanel')}
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="p-0" onSelect={(e) => e.preventDefault()}>
                       <LanguageSelect inDropdown />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <form action={`${localePrefix}/auth/signout`} method="post" className="w-full">
                        <button type="submit" className="w-full text-left flex items-center gap-2">
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




