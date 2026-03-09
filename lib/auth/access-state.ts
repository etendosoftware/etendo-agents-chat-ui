export type AgentAccessLevel = 'public' | 'non_client' | 'partner' | 'customer' | 'admin'

export interface JiraMembershipResponse {
  isJiraUser?: boolean
  isESD?: boolean
  isCSP?: boolean
}

export interface ProfileAccessState {
  role: string | null
  isPartner: boolean
  isCustomer: boolean
  isAdmin: boolean
}

export interface PersistedProfileMemberships {
  role: string
  is_partner: boolean
  is_customer: boolean
}

export function buildProfileAccessState(profile: {
  role?: string | null
  is_partner?: boolean | null
  is_customer?: boolean | null
} | null | undefined): ProfileAccessState {
  const role = profile?.role ?? null
  const isAdmin = role === 'admin'

  return {
    role,
    isPartner: Boolean(profile?.is_partner),
    isCustomer: Boolean(profile?.is_customer),
    isAdmin,
  }
}

export function buildMembershipsFromJira(jiraData: JiraMembershipResponse): PersistedProfileMemberships {
  const isPartner = Boolean(jiraData.isESD)
  const isCustomer = Boolean(jiraData.isCSP)

  return {
    role: isPartner ? 'partner' : 'non_client',
    is_partner: isPartner,
    is_customer: isCustomer,
  }
}

export function getUserAccessLabel(accessState: ProfileAccessState | null): string | null {
  if (!accessState) {
    return null
  }

  if (accessState.isAdmin) {
    return 'admin'
  }

  if (accessState.isPartner && accessState.isCustomer) {
    return 'partner_customer'
  }

  if (accessState.isPartner) {
    return 'partner'
  }

  if (accessState.isCustomer) {
    return 'customer'
  }

  return 'non_client'
}
