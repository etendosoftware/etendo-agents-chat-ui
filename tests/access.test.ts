import { canUserAccessAgent, shouldListAgentOnHome } from '../lib/agents/access'

const nonClientState = { role: 'non_client', isPartner: false, isCustomer: false, isAdmin: false } as const
const partnerState = { role: 'partner', isPartner: true, isCustomer: false, isAdmin: false } as const
const customerState = { role: 'non_client', isPartner: false, isCustomer: true, isAdmin: false } as const
const mixedState = { role: 'partner', isPartner: true, isCustomer: true, isAdmin: false } as const
const adminState = { role: 'admin', isPartner: false, isCustomer: false, isAdmin: true } as const

describe('Agent access helpers', () => {
  describe('canUserAccessAgent', () => {
    it('allows guests on public agents only', () => {
      expect(canUserAccessAgent({ accessLevel: 'public', isAuthenticated: false, accessState: null })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: false, accessState: null })).toBe(false)
    })

    it('grants partner agent access only to partner or admin users', () => {
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, accessState: partnerState })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, accessState: adminState })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, accessState: nonClientState })).toBe(false)
    })

    it('grants customer agent access to customer or mixed memberships', () => {
      expect(canUserAccessAgent({ accessLevel: 'customer', isAuthenticated: true, accessState: customerState })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'customer', isAuthenticated: true, accessState: mixedState })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'customer', isAuthenticated: true, accessState: nonClientState })).toBe(false)
    })

    it('grants non_client agent access only to users without Jira memberships or admin', () => {
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, accessState: nonClientState })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, accessState: partnerState })).toBe(false)
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, accessState: customerState })).toBe(false)
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, accessState: adminState })).toBe(true)
    })

    it('restricts admin agents to admins only', () => {
      expect(canUserAccessAgent({ accessLevel: 'admin', isAuthenticated: true, accessState: adminState })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'admin', isAuthenticated: true, accessState: partnerState })).toBe(false)
    })

    it('denies access when authenticated user has no role metadata', () => {
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, accessState: null })).toBe(false)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, accessState: null })).toBe(false)
    })

    it('always denies non-public agents to unauthenticated users', () => {
      ;(['non_client', 'partner', 'customer', 'admin'] as const).forEach(level => {
        expect(canUserAccessAgent({ accessLevel: level, isAuthenticated: false, accessState: null })).toBe(false)
      })
    })
  })

  describe('shouldListAgentOnHome', () => {
    it('never lists public agents on authenticated dashboard', () => {
      expect(shouldListAgentOnHome('public', adminState)).toBe(false)
      expect(shouldListAgentOnHome('public', nonClientState)).toBe(false)
    })

    it('respects role alignment', () => {
      expect(shouldListAgentOnHome('partner', partnerState)).toBe(true)
      expect(shouldListAgentOnHome('partner', nonClientState)).toBe(false)
      expect(shouldListAgentOnHome('customer', customerState)).toBe(true)
      expect(shouldListAgentOnHome('customer', partnerState)).toBe(false)
      expect(shouldListAgentOnHome('non_client', nonClientState)).toBe(true)
      expect(shouldListAgentOnHome('non_client', mixedState)).toBe(false)
    })

    it('allows admins to see everything but public agents', () => {
      expect(shouldListAgentOnHome('partner', adminState)).toBe(true)
      expect(shouldListAgentOnHome('customer', adminState)).toBe(true)
      expect(shouldListAgentOnHome('non_client', adminState)).toBe(true)
      expect(shouldListAgentOnHome('admin', adminState)).toBe(true)
    })

    it('hides non-public agents when user role is unknown', () => {
      expect(shouldListAgentOnHome('non_client', null)).toBe(false)
      expect(shouldListAgentOnHome('partner', null)).toBe(false)
      expect(shouldListAgentOnHome('customer', null)).toBe(false)
      expect(shouldListAgentOnHome('admin', null)).toBe(false)
    })
  })
})
