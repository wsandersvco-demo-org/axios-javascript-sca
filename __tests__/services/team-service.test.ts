/**
 * Unit tests for Team Service
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import * as core from '../../__fixtures__/core.js'
import type { VeracodeClient } from '../../src/veracode/client.js'
import type { TeamService as TeamServiceType } from '../../src/services/team-service.js'
import type {
  TeamConfiguration,
  VeracodeTeam,
  TeamMember
} from '../../src/types.js'

// Mock the Veracode client
const mockGetTeams = jest.fn()
const mockCreateTeam = jest.fn()
const mockUpdateTeam = jest.fn()
const mockVeracodeClient = {
  getTeams: mockGetTeams,
  createTeam: mockCreateTeam,
  updateTeam: mockUpdateTeam
} as unknown as VeracodeClient

jest.unstable_mockModule('@actions/core', () => core)

describe('services/team-service.ts', () => {
  let TeamService: typeof TeamServiceType
  let service: TeamServiceType

  beforeEach(async () => {
    const module = await import('../../src/services/team-service.js')
    TeamService = module.TeamService

    jest.clearAllMocks()
    service = new TeamService(mockVeracodeClient)
  })

  describe('findTeamByName', () => {
    it('should find team by exact name match', async () => {
      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'Test Team',
        team_legacy_id: 456
      }

      mockGetTeams.mockResolvedValue({
        teams: [mockTeam],
        page: { size: 100, totalElements: 1, totalPages: 1, number: 0 }
      })

      const result = await service.findTeamByName('Test Team')

      expect(result).toEqual(mockTeam)
      expect(mockGetTeams).toHaveBeenCalledWith({
        pageable: { page: 0, size: 100 },
        team_name: 'Test Team',
        ignore_self_teams: true
      })
    })

    it('should return null when team not found', async () => {
      mockGetTeams.mockResolvedValue({
        teams: [],
        page: { size: 100, totalElements: 0, totalPages: 0, number: 0 }
      })

      const result = await service.findTeamByName('Non-existent Team')

      expect(result).toBeNull()
    })

    it('should filter for exact match when API returns partial matches', async () => {
      const teams: VeracodeTeam[] = [
        { team_id: 'team-1', team_name: 'Test', team_legacy_id: 1 },
        { team_id: 'team-2', team_name: 'Test Team', team_legacy_id: 2 },
        { team_id: 'team-3', team_name: 'Testing', team_legacy_id: 3 }
      ]

      mockGetTeams.mockResolvedValue({
        teams,
        page: { size: 100, totalElements: 3, totalPages: 1, number: 0 }
      })

      const result = await service.findTeamByName('Test Team')

      expect(result).toEqual(teams[1])
      expect(result?.team_name).toBe('Test Team')
    })

    it('should paginate through results', async () => {
      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'My Team',
        team_legacy_id: 456
      }

      // First page - no match, full page
      mockGetTeams.mockResolvedValueOnce({
        teams: Array(100).fill({
          team_id: 'other',
          team_name: 'Other Team',
          team_legacy_id: 1
        }),
        page: { size: 100, totalElements: 150, totalPages: 2, number: 0 }
      })

      // Second page - has match
      mockGetTeams.mockResolvedValueOnce({
        teams: [mockTeam],
        page: { size: 100, totalElements: 150, totalPages: 2, number: 1 }
      })

      const result = await service.findTeamByName('My Team')

      expect(result).toEqual(mockTeam)
      expect(mockGetTeams).toHaveBeenCalledTimes(2)
    })

    it('should stop pagination when page is not full', async () => {
      mockGetTeams.mockResolvedValue({
        teams: Array(50).fill({
          team_id: 'other',
          team_name: 'Other Team',
          team_legacy_id: 1
        }),
        page: { size: 100, totalElements: 50, totalPages: 1, number: 0 }
      })

      const result = await service.findTeamByName('Non-existent')

      expect(result).toBeNull()
      expect(mockGetTeams).toHaveBeenCalledTimes(1)
    })
  })

  describe('createTeam', () => {
    it('should create team without members', async () => {
      const config: TeamConfiguration = {
        team_name: 'New Team',
        description: 'Test description',
        business_unit: 'Engineering',
        member_only: false,
        members: []
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'New Team',
        team_legacy_id: 456
      }

      mockCreateTeam.mockResolvedValue(mockTeam)

      const result = await service.createTeam(config)

      expect(result).toEqual(mockTeam)
      expect(mockCreateTeam).toHaveBeenCalledWith({
        team_name: 'New Team',
        bu_name: 'Engineering',
        member_only: false,
        description: 'Test description'
      })
      expect(mockUpdateTeam).not.toHaveBeenCalled()
    })

    it('should create team with members', async () => {
      const members: TeamMember[] = [
        { user: 'user1@example.com', relationship: 'ADMIN' },
        { user: 'user2@example.com', relationship: 'MEMBER' }
      ]

      const config: TeamConfiguration = {
        team_name: 'New Team',
        members
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'New Team',
        team_legacy_id: 456
      }

      mockCreateTeam.mockResolvedValue(mockTeam)
      mockUpdateTeam.mockResolvedValue(mockTeam)

      const result = await service.createTeam(config)

      expect(result).toEqual(mockTeam)
      expect(mockCreateTeam).toHaveBeenCalled()
      expect(mockUpdateTeam).toHaveBeenCalledWith(
        'team-123',
        {
          team_name: 'New Team',
          users: [
            { user_name: 'user1@example.com', relationship: 'ADMIN' },
            { user_name: 'user2@example.com', relationship: 'MEMBER' }
          ]
        },
        { partial: true, incremental: true }
      )
    })

    it('should default member_only to false', async () => {
      const config: TeamConfiguration = {
        team_name: 'New Team',
        members: []
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'New Team',
        team_legacy_id: 456
      }

      mockCreateTeam.mockResolvedValue(mockTeam)

      await service.createTeam(config)

      expect(mockCreateTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          member_only: false
        })
      )
    })
  })

  describe('updateTeam', () => {
    it('should update team with all fields', async () => {
      const config: TeamConfiguration = {
        team_name: 'Updated Team',
        description: 'Updated description',
        business_unit: 'Security',
        member_only: true,
        members: [{ user: 'user@example.com', relationship: 'ADMIN' }]
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'Updated Team',
        team_legacy_id: 456
      }

      mockUpdateTeam.mockResolvedValue(mockTeam)

      const result = await service.updateTeam('team-123', config)

      expect(result).toEqual(mockTeam)
      expect(mockUpdateTeam).toHaveBeenCalledWith(
        'team-123',
        {
          team_name: 'Updated Team',
          bu_name: 'Security',
          member_only: true,
          description: 'Updated description',
          users: [{ user_name: 'user@example.com', relationship: 'ADMIN' }]
        },
        { partial: true, incremental: true }
      )
    })

    it('should update team with empty members', async () => {
      const config: TeamConfiguration = {
        team_name: 'Team',
        members: []
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'Team',
        team_legacy_id: 456
      }

      mockUpdateTeam.mockResolvedValue(mockTeam)

      await service.updateTeam('team-123', config)

      expect(mockUpdateTeam).toHaveBeenCalledWith(
        'team-123',
        expect.objectContaining({
          users: []
        }),
        { partial: true, incremental: true }
      )
    })

    it('should use partial and incremental flags', async () => {
      const config: TeamConfiguration = {
        team_name: 'Team',
        members: []
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'Team',
        team_legacy_id: 456
      }

      mockUpdateTeam.mockResolvedValue(mockTeam)

      await service.updateTeam('team-123', config)

      expect(mockUpdateTeam).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { partial: true, incremental: true }
      )
    })
  })

  describe('createOrUpdateTeam', () => {
    it('should create new team when team does not exist', async () => {
      const config: TeamConfiguration = {
        team_name: 'New Team',
        members: []
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'New Team',
        team_legacy_id: 456
      }

      mockGetTeams.mockResolvedValue({
        teams: [],
        page: { size: 100, totalElements: 0, totalPages: 0, number: 0 }
      })
      mockCreateTeam.mockResolvedValue(mockTeam)

      const result = await service.createOrUpdateTeam(config)

      expect(result.team).toEqual(mockTeam)
      expect(result.action).toBe('created')
      expect(mockCreateTeam).toHaveBeenCalled()
      expect(mockUpdateTeam).not.toHaveBeenCalled()
    })

    it('should update existing team when team exists', async () => {
      const config: TeamConfiguration = {
        team_name: 'Existing Team',
        members: []
      }

      const existingTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'Existing Team',
        team_legacy_id: 456
      }

      mockGetTeams.mockResolvedValue({
        teams: [existingTeam],
        page: { size: 100, totalElements: 1, totalPages: 1, number: 0 }
      })
      mockUpdateTeam.mockResolvedValue(existingTeam)

      const result = await service.createOrUpdateTeam(config)

      expect(result.team).toEqual(existingTeam)
      expect(result.action).toBe('updated')
      expect(mockUpdateTeam).toHaveBeenCalled()
      expect(mockCreateTeam).not.toHaveBeenCalled()
    })

    it('should handle team with members in create scenario', async () => {
      const config: TeamConfiguration = {
        team_name: 'New Team',
        members: [{ user: 'user@example.com', relationship: 'ADMIN' }]
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'New Team',
        team_legacy_id: 456
      }

      mockGetTeams.mockResolvedValue({
        teams: [],
        page: { size: 100, totalElements: 0, totalPages: 0, number: 0 }
      })
      mockCreateTeam.mockResolvedValue(mockTeam)
      mockUpdateTeam.mockResolvedValue(mockTeam)

      const result = await service.createOrUpdateTeam(config)

      expect(result.action).toBe('created')
      expect(mockCreateTeam).toHaveBeenCalled()
      // Should also call update to add members
      expect(mockUpdateTeam).toHaveBeenCalled()
    })
  })

  describe('logging', () => {
    it('should log team search', async () => {
      mockGetTeams.mockResolvedValue({
        teams: [],
        page: { size: 100, totalElements: 0, totalPages: 0, number: 0 }
      })

      await service.findTeamByName('Test Team')

      expect(core.info).toHaveBeenCalledWith('Searching for team: Test Team')
      expect(core.info).toHaveBeenCalledWith('Team not found: Test Team')
    })

    it('should log team creation', async () => {
      const config: TeamConfiguration = {
        team_name: 'New Team',
        members: []
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'New Team',
        team_legacy_id: 456
      }

      mockCreateTeam.mockResolvedValue(mockTeam)

      await service.createTeam(config)

      expect(core.info).toHaveBeenCalledWith('Creating new team: New Team')
      expect(core.info).toHaveBeenCalledWith(
        'Team created successfully: New Team (team-123)'
      )
    })

    it('should log team update', async () => {
      const config: TeamConfiguration = {
        team_name: 'Updated Team',
        members: [{ user: 'user@example.com', relationship: 'ADMIN' }]
      }

      const mockTeam: VeracodeTeam = {
        team_id: 'team-123',
        team_name: 'Updated Team',
        team_legacy_id: 456
      }

      mockUpdateTeam.mockResolvedValue(mockTeam)

      await service.updateTeam('team-123', config)

      expect(core.info).toHaveBeenCalledWith(
        'Updating team: Updated Team (team-123)'
      )
      expect(core.info).toHaveBeenCalledWith(
        'Team updated successfully: 1 members processed'
      )
    })
  })
})
