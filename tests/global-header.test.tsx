import { act } from 'react-dom/test-utils'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { GlobalHeader } from '@/components/global-header'
import { renderWithIntl } from './utils/intl'

const pushMock = vi.fn()
let currentPathname = '/en/dashboard'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: vi.fn(),
  }),
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams('foo=bar'),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element -- acceptable for tests
    <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />
  ),
}))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

interface SelectContextValue {
  value: string
  onValueChange?: (value: string) => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  registerOption: (value: string, label: string) => void
  options: Record<string, string>
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange?: (value: string) => void; children: React.ReactNode }) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [options, setOptions] = React.useState<Record<string, string>>({})

    const registerOption = React.useCallback((optionValue: string, label: string) => {
      setOptions(prev => (prev[optionValue] === label ? prev : { ...prev, [optionValue]: label }))
    }, [])

    return (
      <SelectContext.Provider value={{ value, onValueChange, isOpen, setIsOpen, registerOption, options }}>
        <div>{children}</div>
      </SelectContext.Provider>
    )
  },
  SelectTrigger: ({ children, 'aria-label': ariaLabel, onClick, ...rest }: React.ComponentProps<'button'>) => {
    const ctx = React.useContext(SelectContext)
    if (!ctx) return null

    return (
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={ctx.isOpen}
        onClick={event => {
          ctx.setIsOpen(!ctx.isOpen)
          onClick?.(event)
        }}
        {...rest}
      >
        {children}
      </button>
    )
  },
  SelectContent: ({ children, ...rest }: React.ComponentProps<'div'>) => {
    const ctx = React.useContext(SelectContext)
    if (!ctx || !ctx.isOpen) return null

    return (
      <div role="listbox" {...rest}>
        {children}
      </div>
    )
  },
  SelectItem: ({ value, children, ...rest }: { value: string; children: React.ReactNode } & React.ComponentProps<'button'>) => {
    const ctx = React.useContext(SelectContext)
    if (!ctx) return null

    const label = React.useMemo(() => {
      if (typeof children === 'string') return children
      return React.Children.toArray(children).join(' ')
    }, [children])

    React.useEffect(() => {
      ctx.registerOption(value, label as string)
    }, [ctx, value, label])

    return (
      <button
        type="button"
        role="option"
        onClick={() => {
          ctx.onValueChange?.(value)
          ctx.setIsOpen(false)
        }}
        {...rest}
      >
        {children}
      </button>
    )
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    const ctx = React.useContext(SelectContext)
    if (!ctx) return null

    const label = ctx.options[ctx.value] ?? placeholder ?? ''

    return <span>{label}</span>
  },
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectSeparator: () => null,
  SelectScrollDownButton: () => null,
  SelectScrollUpButton: () => null,
}))

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}))

const baseProps = {
  user: null,
  userRole: null,
  disableHamburgerMenu: false,
  agent: {
    id: 'agent-1',
    name: 'Agent',
    description: 'Test agent',
    webhookurl: 'https://example.com',
    path: '/agent',
    color: '#fff',
    icon: 'icon',
    access_level: 'public' as const,
  },
}

describe('GlobalHeader i18n', () => {
  beforeEach(() => {
    pushMock.mockClear()
    currentPathname = '/en/dashboard'
  })

  it('renders the language selector alongside translated navigation', () => {
    renderWithIntl(<GlobalHeader {...baseProps} />)

    const triggers = screen.getAllByRole('combobox', { name: /language/i })
    expect(triggers.length).toBeGreaterThan(0)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('navigates to the selected locale preserving search params', async () => {
    const user = userEvent.setup()
    renderWithIntl(<GlobalHeader {...baseProps} />)

    const [trigger] = screen.getAllByRole('combobox', { name: /language/i })
    await act(async () => {
      await user.click(trigger)
    })
    await act(async () => {
      await user.click(screen.getByRole('option', { name: /spanish/i }))
    })

    expect(pushMock).toHaveBeenCalledWith('/es/dashboard?foo=bar')
  })

  it('does not navigate when selecting the current locale', async () => {
    const user = userEvent.setup()
    renderWithIntl(<GlobalHeader {...baseProps} />)

    const [trigger] = screen.getAllByRole('combobox', { name: /language/i })
    await act(async () => {
      await user.click(trigger)
    })
    await act(async () => {
      await user.click(screen.getByRole('option', { name: /english/i }))
    })

    expect(pushMock).not.toHaveBeenCalled()
  })
})
