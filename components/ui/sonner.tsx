'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'flex gap-3 rounded-xl border border-border bg-white shadow-lg px-4 py-3',
          title: 'text-sm font-semibold text-foreground',
          description: 'text-sm text-foreground/70',
          success: 'border-l-4 border-l-green-600',
          error: 'border-l-4 border-l-red-500',
          warning: 'border-l-4 border-l-yellow-500',
          info: 'border-l-4 border-l-blue-500',
          icon: 'mt-0.5',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
