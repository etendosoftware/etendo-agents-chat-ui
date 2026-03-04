'use client'

import { Bell, BellOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useNotificationContext } from '@/lib/notification-context'

export function NotificationBell() {
  const ctx = useNotificationContext()
  const t = useTranslations('chat.interface.notifications')

  if (!ctx || !ctx.supported) return null

  const { permissionState, enabled, requestPermission, toggleEnabled } = ctx

  const handleClick = () => {
    if (permissionState === 'default') {
      requestPermission()
    } else if (permissionState === 'granted') {
      toggleEnabled()
    } else {
      toast.info(t('permissionDenied'))
    }
  }

  const isDenied = permissionState === 'denied'
  const isActive = permissionState === 'granted' && enabled
  const tooltipText = isDenied
    ? t('permissionDenied')
    : isActive
      ? t('disable')
      : t('enable')

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            aria-label={tooltipText}
            className="inline-flex items-center justify-center rounded-full p-2 transition-colors hover:bg-slate-100/70"
          >
            {isActive ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-slate-500" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
