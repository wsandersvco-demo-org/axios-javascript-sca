/**
 * Type definitions for Veracode Create Teams Action
 */

export interface TeamConfiguration {
  team_name: string
  description?: string
  business_unit?: string
  member_only?: boolean
  members: TeamMember[]
  sync_github_collaborators?: boolean
  github_collaborator_filter?: ('admin' | 'write' | 'read')[]
}

export interface TeamMember {
  user: string // Email or username
  relationship: 'ADMIN' | 'MEMBER'
}

export interface TeamMapping {
  version: string
  defaults?: DefaultSettings
  mappings: Record<string, TeamConfiguration>
  fallback?: FallbackConfiguration
}

export interface DefaultSettings {
  business_unit?: string
  member_only?: boolean
  auto_add_collaborators?: boolean
  incremental_updates?: boolean
}

export interface FallbackConfiguration {
  auto_create: boolean
  team_name_template?: string
  default_members?: TeamMember[]
}

/**
 * Veracode API team response
 */
export interface VeracodeTeam {
  team_id: string
  team_name: string
  team_legacy_id: number
  user_count?: number
  business_unit?: {
    bu_id: string
    bu_name: string
  }
  users?: VeracodeUser[]
  insert_ts?: string
  modify_ts?: string
}

/**
 * Veracode API user response
 */
export interface VeracodeUser {
  user_id: string
  user_name: string
  email_address: string
  first_name?: string
  last_name?: string
  active: boolean
  login_enabled: boolean
  account_type: string
  roles?: Array<{
    role_id: string
    role_name: string
  }>
}

/**
 * User validation result
 */
export interface UserValidationResult {
  validMembers: TeamMember[]
  invalidMembers: InvalidMember[]
}

export interface InvalidMember {
  user: string
  reason: string
}

export interface ActionInputs {
  githubToken: string
  veracodeApiId: string
  veracodeApiKey: string
  repository: string
  owner: string
  configRepository: string
  configRef?: string
  mappingPath: string
  veracodeRegion: 'US' | 'EU' | 'FEDERAL'
}

export interface ActionOutputs {
  teamId: string
  teamName: string
  teamLegacyId: number
  actionTaken: 'created' | 'updated' | 'skipped'
  memberCount: number
  membersAdded: number
  membersSkipped: number
  skippedUsers: string[]
}

/**
 * Pagination parameters for Veracode API
 */
export interface Pageable {
  page: number
  size: number
}

/**
 * Veracode API paginated response
 */
export interface PaginatedResponse<T> {
  _embedded?: {
    [key: string]: T[]
  }
  page: {
    size: number
    totalElements: number
    totalPages: number
    number: number
  }
}
