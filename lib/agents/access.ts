import type { AgentAccessLevel, ProfileAccessState } from '@/lib/auth/access-state'

export interface AccessContext {
  accessLevel: AgentAccessLevel
  accessState: ProfileAccessState | null
  isAuthenticated: boolean
}

export function canUserAccessAgent({ accessLevel, accessState, isAuthenticated }: AccessContext): boolean {
  if (accessLevel === 'public') {
    return !isAuthenticated
  }

  if (!isAuthenticated) {
    return false
  }

  if (accessState?.isAdmin) {
    return true
  }

  if (accessLevel === 'non_client') {
    return Boolean(accessState) && accessState?.isPartner !== true && accessState?.isCustomer !== true
  }

  if (accessLevel === 'partner') {
    return Boolean(accessState?.isPartner)
  }

  if (accessLevel === 'customer') {
    return Boolean(accessState?.isCustomer)
  }

  if (accessLevel === 'admin') {
    return accessState?.isAdmin === true
  }

  return false
}

export function shouldListAgentOnHome(accessLevel: AgentAccessLevel, accessState: ProfileAccessState | null): boolean {
  if (accessLevel === 'public') {
    return false
  }

  if (accessState?.isAdmin) {
    return true
  }

  if (accessLevel === 'non_client') {
    return Boolean(accessState) && accessState?.isPartner !== true && accessState?.isCustomer !== true
  }

  if (accessLevel === 'partner') {
    return accessState?.isPartner === true
  }

  if (accessLevel === 'customer') {
    return accessState?.isCustomer === true
  }

  if (accessLevel === 'admin') {
    return accessState?.isAdmin === true
  }

  return false
}
