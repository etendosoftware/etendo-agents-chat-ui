import { canUserAccessAgent, shouldListAgentOnHome } from '../lib/agents/access'

describe('Agent access helpers', () => {
  describe('canUserAccessAgent', () => {
    it('allows guests on public agents only', () => {
      expect(canUserAccessAgent({ accessLevel: 'public', isAuthenticated: false, userRole: null })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: false, userRole: null })).toBe(false)
    })

    it('grants partner agent access only to partner or admin users', () => {
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, userRole: 'partner' })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, userRole: 'admin' })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, userRole: 'non_client' })).toBe(false)
    })

    it('grants non_client agent access to matching role or admin', () => {
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, userRole: 'non_client' })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, userRole: 'partner' })).toBe(false)
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, userRole: 'admin' })).toBe(true)
    })

    it('restricts admin agents to admins only', () => {
      expect(canUserAccessAgent({ accessLevel: 'admin', isAuthenticated: true, userRole: 'admin' })).toBe(true)
      expect(canUserAccessAgent({ accessLevel: 'admin', isAuthenticated: true, userRole: 'partner' })).toBe(false)
    })

    it('denies access when authenticated user has no role metadata', () => {
      expect(canUserAccessAgent({ accessLevel: 'non_client', isAuthenticated: true, userRole: null })).toBe(false)
      expect(canUserAccessAgent({ accessLevel: 'partner', isAuthenticated: true, userRole: null })).toBe(false)
    })

    it('always denies non-public agents to unauthenticated users', () => {
      ;(['non_client', 'partner', 'admin'] as const).forEach(level => {
        expect(canUserAccessAgent({ accessLevel: level, isAuthenticated: false, userRole: null })).toBe(false)
      })
    })
  })

  describe('shouldListAgentOnHome', () => {
    it('never lists public agents on authenticated dashboard', () => {
      expect(shouldListAgentOnHome('public', 'admin')).toBe(false)
      expect(shouldListAgentOnHome('public', 'non_client')).toBe(false)
    })

    it('respects role alignment', () => {
      expect(shouldListAgentOnHome('partner', 'partner')).toBe(true)
      expect(shouldListAgentOnHome('partner', 'non_client')).toBe(false)
      expect(shouldListAgentOnHome('non_client', 'non_client')).toBe(true)
      expect(shouldListAgentOnHome('non_client', 'partner')).toBe(false)
    })

    it('allows admins to see everything but public agents', () => {
      expect(shouldListAgentOnHome('partner', 'admin')).toBe(true)
      expect(shouldListAgentOnHome('non_client', 'admin')).toBe(true)
      expect(shouldListAgentOnHome('admin', 'admin')).toBe(true)
    })

    it('hides non-public agents when user role is unknown', () => {
      expect(shouldListAgentOnHome('non_client', null)).toBe(false)
      expect(shouldListAgentOnHome('partner', null)).toBe(false)
      expect(shouldListAgentOnHome('admin', null)).toBe(false)
    })
  })
})
