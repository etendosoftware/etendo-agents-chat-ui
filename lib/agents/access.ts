export type AgentAccessLevel = 'public' | 'non_client' | 'partner' | 'admin'
export type UserRole = 'non_client' | 'partner' | 'admin' | null

export interface AccessContext {
  accessLevel: AgentAccessLevel
  userRole: UserRole
  isAuthenticated: boolean
}

export function canUserAccessAgent({ accessLevel, userRole, isAuthenticated }: AccessContext): boolean {
  if (accessLevel === 'public') {
    return !isAuthenticated
  }

  if (!isAuthenticated) {
    return false
  }

  if (accessLevel === 'non_client') {
    return userRole === 'non_client' || userRole === 'admin'
  }

  if (accessLevel === 'partner') {
    return userRole === 'partner' || userRole === 'admin'
  }

  if (accessLevel === 'admin') {
    return userRole === 'admin'
  }

  return false
}

export function shouldListAgentOnHome(accessLevel: AgentAccessLevel, userRole: UserRole): boolean {
  if (accessLevel === 'public') {
    return false
  }

  if (accessLevel === 'non_client') {
    return userRole === 'non_client' || userRole === 'admin'
  }

  if (accessLevel === 'partner') {
    return userRole === 'partner' || userRole === 'admin'
  }

  if (accessLevel === 'admin') {
    return userRole === 'admin'
  }

  return false
}
