/**
 * Unit tests for main.ts
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock all dependencies
const mockOctokit = {
  rest: {
    repos: {
      getContent: jest.fn()
    }
  }
}

const mockGetOctokit = jest.fn()
const mockVeracodeClient = {
  getTeams: jest.fn(),
  getTeam: jest.fn(),
  createTeam: jest.fn(),
  updateTeam: jest.fn(),
  getUsers: jest.fn()
}

const mockUserValidator = {
  validateTeamMembers: jest.fn()
}

const mockTeamService = {
  findTeamByName: jest.fn(),
  createTeam: jest.fn(),
  updateTeam: jest.fn()
}

const mockGitHubService = {
  fetchCollaborators: jest.fn()
}

const mockConfigurationResolver = {
  resolveTeamConfiguration: jest.fn()
}

// Set up module mocks
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))

jest.unstable_mockModule('../src/veracode/client.js', () => ({
  VeracodeClient: jest.fn(() => mockVeracodeClient)
}))

jest.unstable_mockModule('../src/services/user-validator.js', () => ({
  UserValidator: jest.fn(() => mockUserValidator)
}))

jest.unstable_mockModule('../src/services/team-service.js', () => ({
  TeamService: jest.fn(() => mockTeamService)
}))

jest.unstable_mockModule('../src/services/github-service.js', () => ({
  GitHubService: class {
    constructor() {
      return mockGitHubService
    }
    static mergeMembers = jest.fn((configMembers, githubMembers) => [
      ...configMembers,
      ...githubMembers
    ])
  }
}))

jest.unstable_mockModule('../src/config/resolver.js', () => ({
  ConfigurationResolver: jest.fn(() => mockConfigurationResolver)
}))

jest.unstable_mockModule('../src/config/validator.js', () => ({
  validateMapping: jest.fn((mapping) => mapping)
}))

jest.unstable_mockModule('../src/utils/retry.js', () => ({
  executeWithRetry: jest.fn(async (fn) => fn())
}))

// Import the module under test
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  const defaultInputs = {
    'github-token': 'test-github-token',
    'veracode-api-id': 'test-api-id',
    'veracode-api-key': 'test-api-key',
    repository: 'test-repo',
    owner: 'test-owner',
    'config-repository': '.veracode',
    'config-ref': '',
    'veracode-team-mapping-yaml': 'team-mapping.yaml',
    'veracode-region': 'US'
  }

  const validTeamConfig = {
    team_name: 'Test Team',
    members: [
      { user: 'user1@example.com', relationship: 'ADMIN' },
      { user: 'user2@example.com', relationship: 'MEMBER' }
    ]
  }

  const mockTeam = {
    team_id: 'team-uuid-123',
    team_name: 'Test Team',
    team_legacy_id: 12345,
    user_count: 2
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup default input mocks
    core.getInput.mockImplementation(
      (name: string) => defaultInputs[name] || ''
    )

    // Setup default octokit mock
    mockGetOctokit.mockReturnValue(mockOctokit)

    // Setup default GitHub file fetch with valid YAML
    const yamlContent = Buffer.from(
      `
version: "1.0"
mappings:
  test-repo:
    team_name: "Test Team"
    members:
      - user: "user1@example.com"
        relationship: "ADMIN"
      - user: "user2@example.com"
        relationship: "MEMBER"
`
    ).toString('base64')
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: yamlContent,
        size: 100
      }
    })

    // Setup default team configuration resolver
    mockConfigurationResolver.resolveTeamConfiguration.mockReturnValue(
      validTeamConfig
    )

    // Setup default user validation (all valid)
    mockUserValidator.validateTeamMembers.mockResolvedValue({
      validMembers: validTeamConfig.members,
      invalidMembers: []
    })
  })

  describe('Successful Workflows', () => {
    it('should create a new team when team does not exist', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(mockTeamService.findTeamByName).toHaveBeenCalledWith('Test Team')
      expect(mockTeamService.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          team_name: 'Test Team',
          members: validTeamConfig.members
        })
      )
      expect(core.setOutput).toHaveBeenCalledWith('team-id', 'team-uuid-123')
      expect(core.setOutput).toHaveBeenCalledWith('team-name', 'Test Team')
      expect(core.setOutput).toHaveBeenCalledWith('action-taken', 'created')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('should update an existing team when team exists', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(mockTeam)
      mockTeamService.updateTeam.mockResolvedValue(mockTeam)

      await run()

      expect(mockTeamService.findTeamByName).toHaveBeenCalledWith('Test Team')
      expect(mockTeamService.updateTeam).toHaveBeenCalledWith(
        'team-uuid-123',
        expect.objectContaining({
          team_name: 'Test Team',
          members: validTeamConfig.members
        })
      )
      expect(core.setOutput).toHaveBeenCalledWith('action-taken', 'updated')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('should set all expected outputs', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(core.setOutput).toHaveBeenCalledWith('team-id', 'team-uuid-123')
      expect(core.setOutput).toHaveBeenCalledWith('team-name', 'Test Team')
      expect(core.setOutput).toHaveBeenCalledWith('team-legacy-id', 12345)
      expect(core.setOutput).toHaveBeenCalledWith('action-taken', 'created')
      expect(core.setOutput).toHaveBeenCalledWith('member-count', 2)
      expect(core.setOutput).toHaveBeenCalledWith('members-added', 2)
      expect(core.setOutput).toHaveBeenCalledWith('members-skipped', 0)
      expect(core.setOutput).toHaveBeenCalledWith('skipped-users', '')
    })
  })

  describe('User Validation', () => {
    it('should skip invalid users and report them', async () => {
      mockUserValidator.validateTeamMembers.mockResolvedValue({
        validMembers: [{ user: 'user1@example.com', relationship: 'ADMIN' }],
        invalidMembers: [
          { user: 'user2@example.com', reason: 'User not found in Veracode' }
        ]
      })
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(mockTeamService.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          members: [{ user: 'user1@example.com', relationship: 'ADMIN' }]
        })
      )
      expect(core.setOutput).toHaveBeenCalledWith('members-added', 1)
      expect(core.setOutput).toHaveBeenCalledWith('members-skipped', 1)
      expect(core.setOutput).toHaveBeenCalledWith(
        'skipped-users',
        'user2@example.com'
      )
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('1 users will be skipped')
      )
    })

    it('should handle all users being invalid', async () => {
      mockUserValidator.validateTeamMembers.mockResolvedValue({
        validMembers: [],
        invalidMembers: [
          { user: 'user1@example.com', reason: 'User not found' },
          { user: 'user2@example.com', reason: 'User inactive' }
        ]
      })
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue({
        ...mockTeam,
        user_count: 0
      })

      await run()

      expect(core.setOutput).toHaveBeenCalledWith('members-added', 0)
      expect(core.setOutput).toHaveBeenCalledWith('members-skipped', 2)
    })

    it('should skip update when existing team has no valid members', async () => {
      mockUserValidator.validateTeamMembers.mockResolvedValue({
        validMembers: [],
        invalidMembers: [
          { user: 'user1@example.com', reason: 'User not found' },
          { user: 'user2@example.com', reason: 'User inactive' }
        ]
      })
      mockTeamService.findTeamByName.mockResolvedValue({
        ...mockTeam,
        user_count: 5
      })

      await run()

      expect(mockTeamService.updateTeam).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith('action-taken', 'skipped')
      expect(core.setOutput).toHaveBeenCalledWith('member-count', 5)
      expect(core.setOutput).toHaveBeenCalledWith('members-added', 0)
      expect(core.setOutput).toHaveBeenCalledWith('members-skipped', 2)
    })
  })

  describe('GitHub Collaborators Integration', () => {
    it('should fetch and merge GitHub collaborators when configured', async () => {
      const teamConfigWithGitHub = {
        ...validTeamConfig,
        sync_github_collaborators: true
      }

      const githubMembers = [
        { user: 'github-user@example.com', relationship: 'MEMBER' }
      ]

      mockConfigurationResolver.resolveTeamConfiguration.mockReturnValue(
        teamConfigWithGitHub
      )
      mockGitHubService.fetchCollaborators.mockResolvedValue(githubMembers)
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(mockGitHubService.fetchCollaborators).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        undefined
      )
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('1 GitHub collaborators')
      )
    })

    it('should skip GitHub collaborator sync when not configured', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(mockGitHubService.fetchCollaborators).not.toHaveBeenCalled()
      // No explicit skip message is logged - it simply doesn't sync
    })

    it('should apply collaborator filter when specified', async () => {
      const teamConfigWithFilter = {
        ...validTeamConfig,
        sync_github_collaborators: true,
        github_collaborator_filter: ['admin', 'write']
      }

      mockConfigurationResolver.resolveTeamConfiguration.mockReturnValue(
        teamConfigWithFilter
      )
      mockGitHubService.fetchCollaborators.mockResolvedValue([])
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(mockGitHubService.fetchCollaborators).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        ['admin', 'write']
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle configuration file fetch failure', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(
        new Error('File not found')
      )

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch file')
      )
    })

    it('should handle invalid configuration', async () => {
      const invalidYamlContent = Buffer.from('invalid: yaml: content').toString(
        'base64'
      )
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: invalidYamlContent,
          size: 50
        }
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('bad indentation')
      )
    })

    it('should handle team creation failure', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockRejectedValue(
        new Error('API Error: Failed to create team')
      )

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create team')
      )
    })

    it('should handle team update failure', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(mockTeam)
      mockTeamService.updateTeam.mockRejectedValue(
        new Error('API Error: Failed to update team')
      )

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update team')
      )
    })

    it('should handle missing required inputs', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'veracode-api-id') return ''
        return defaultInputs[name] || ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalled()
    })
  })

  describe('Configuration Resolution', () => {
    it('should resolve team configuration for the repository', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(
        mockConfigurationResolver.resolveTeamConfiguration
      ).toHaveBeenCalledWith('test-repo')
    })

    it('should handle repository with no matching configuration', async () => {
      mockConfigurationResolver.resolveTeamConfiguration.mockImplementation(
        () => {
          throw new Error('No team configuration found for repository')
        }
      )

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('No team configuration found')
      )
    })
  })

  describe('Regional Configuration', () => {
    it('should use US region by default', async () => {
      const VeracodeClient = await import('../src/veracode/client.js')
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(VeracodeClient.VeracodeClient).toHaveBeenCalledWith(
        'test-api-id',
        'test-api-key',
        'US'
      )
    })

    it('should use specified region', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'veracode-region') return 'EU'
        return defaultInputs[name] || ''
      })

      const VeracodeClient = await import('../src/veracode/client.js')
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(VeracodeClient.VeracodeClient).toHaveBeenCalledWith(
        'test-api-id',
        'test-api-key',
        'EU'
      )
    })
  })

  describe('Logging and Groups', () => {
    it('should log all processing steps', async () => {
      mockTeamService.findTeamByName.mockResolvedValue(null)
      mockTeamService.createTeam.mockResolvedValue(mockTeam)

      await run()

      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Validating inputs')
      )
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Initializing clients')
      )
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Loading team mapping')
      )
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Resolving team configuration')
      )
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Validating users')
      )
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Creating new team')
      )
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining('Setting outputs')
      )
    })
  })
})
