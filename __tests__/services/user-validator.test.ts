/**
 * Unit tests for User Validator Service
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import * as core from '../../__fixtures__/core.js'
import type { VeracodeClient } from '../../src/veracode/client.js'
import type { UserValidator as UserValidatorType } from '../../src/services/user-validator.js'
import type { TeamMember, VeracodeUser } from '../../src/types.js'

// Mock the Veracode client
const mockGetUsers = jest.fn()
const mockVeracodeClient = {
  getUsers: mockGetUsers
} as unknown as VeracodeClient

jest.unstable_mockModule('@actions/core', () => core)

describe('services/user-validator.ts', () => {
  let UserValidator: typeof UserValidatorType
  let validator: UserValidatorType

  beforeEach(async () => {
    const module = await import('../../src/services/user-validator.js')
    UserValidator = module.UserValidator

    jest.clearAllMocks()
    validator = new UserValidator(mockVeracodeClient)
  })

  describe('validateTeamMembers', () => {
    it('should validate all members successfully', async () => {
      const members: TeamMember[] = [
        { user: 'user1@example.com', relationship: 'ADMIN' },
        { user: 'user2@example.com', relationship: 'MEMBER' }
      ]

      const mockUsers: VeracodeUser[] = [
        {
          user_id: 'user-1',
          user_name: 'user1',
          email_address: 'user1@example.com',
          active: true,
          login_enabled: true,
          account_type: 'USER'
        },
        {
          user_id: 'user-2',
          user_name: 'user2',
          email_address: 'user2@example.com',
          active: true,
          login_enabled: true,
          account_type: 'USER'
        }
      ]

      mockGetUsers
        .mockResolvedValueOnce({
          users: [mockUsers[0]],
          page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
        })
        .mockResolvedValueOnce({
          users: [mockUsers[1]],
          page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
        })

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(2)
      expect(result.invalidMembers).toHaveLength(0)
      expect(result.validMembers[0].user).toBe('user1')
      expect(result.validMembers[1].user).toBe('user2')
    })

    it('should handle mix of valid and invalid members', async () => {
      const members: TeamMember[] = [
        { user: 'valid@example.com', relationship: 'ADMIN' },
        { user: 'invalid@example.com', relationship: 'MEMBER' }
      ]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'valid',
        email_address: 'valid@example.com',
        active: true,
        login_enabled: true,
        account_type: 'USER'
      }

      mockGetUsers
        .mockResolvedValueOnce({
          users: [mockUser],
          page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
        })
        .mockResolvedValueOnce({
          users: [],
          page: { size: 50, totalElements: 0, totalPages: 0, number: 0 }
        })

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(1)
      expect(result.invalidMembers).toHaveLength(1)
      expect(result.validMembers[0].user).toBe('valid')
      expect(result.invalidMembers[0].user).toBe('invalid@example.com')
      expect(result.invalidMembers[0].reason).toContain(
        'does not exist in Veracode platform'
      )
    })

    it('should skip inactive users', async () => {
      const members: TeamMember[] = [
        { user: 'inactive@example.com', relationship: 'MEMBER' }
      ]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'inactive',
        email_address: 'inactive@example.com',
        active: false,
        login_enabled: false,
        account_type: 'USER'
      }

      mockGetUsers.mockResolvedValue({
        users: [mockUser],
        page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
      })

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(0)
      expect(result.invalidMembers).toHaveLength(1)
      expect(result.invalidMembers[0].reason).toBe('User account is inactive')
    })

    it('should handle empty member list', async () => {
      const result = await validator.validateTeamMembers([])

      expect(result.validMembers).toHaveLength(0)
      expect(result.invalidMembers).toHaveLength(0)
      expect(mockGetUsers).not.toHaveBeenCalled()
    })

    it('should use cache for repeated validations', async () => {
      const members: TeamMember[] = [
        { user: 'user@example.com', relationship: 'ADMIN' },
        { user: 'USER@EXAMPLE.COM', relationship: 'MEMBER' } // Same user, different case
      ]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'user',
        email_address: 'user@example.com',
        active: true,
        login_enabled: true,
        account_type: 'USER'
      }

      mockGetUsers.mockResolvedValue({
        users: [mockUser],
        page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
      })

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(2)
      expect(mockGetUsers).toHaveBeenCalledTimes(1) // Only called once due to cache
    })

    it('should handle API errors gracefully', async () => {
      const members: TeamMember[] = [
        { user: 'user@example.com', relationship: 'ADMIN' }
      ]

      mockGetUsers.mockRejectedValue(new Error('API Error'))

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(0)
      expect(result.invalidMembers).toHaveLength(1)
      expect(result.invalidMembers[0].reason).toContain('Failed to validate')
    })

    it('should normalize email addresses', async () => {
      const members: TeamMember[] = [
        { user: 'User@Example.COM', relationship: 'ADMIN' }
      ]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'user',
        email_address: 'user@example.com',
        active: true,
        login_enabled: true,
        account_type: 'USER'
      }

      mockGetUsers.mockResolvedValue({
        users: [mockUser],
        page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
      })

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(1)
      expect(result.validMembers[0].user).toBe('user') // Uses user_name from API
    })

    it('should match by username if email not found', async () => {
      const members: TeamMember[] = [{ user: 'jdoe', relationship: 'ADMIN' }]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'jdoe',
        email_address: 'john.doe@example.com',
        active: true,
        login_enabled: true,
        account_type: 'USER'
      }

      mockGetUsers.mockResolvedValue({
        users: [mockUser],
        page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
      })

      const result = await validator.validateTeamMembers(members)

      expect(result.validMembers).toHaveLength(1)
      expect(result.validMembers[0].user).toBe('jdoe') // Uses user_name from API
    })

    it('should log validation summary', async () => {
      const members: TeamMember[] = [
        { user: 'valid@example.com', relationship: 'ADMIN' },
        { user: 'invalid@example.com', relationship: 'MEMBER' }
      ]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'valid',
        email_address: 'valid@example.com',
        active: true,
        login_enabled: true,
        account_type: 'USER'
      }

      mockGetUsers
        .mockResolvedValueOnce({
          users: [mockUser],
          page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
        })
        .mockResolvedValueOnce({
          users: [],
          page: { size: 50, totalElements: 0, totalPages: 0, number: 0 }
        })

      await validator.validateTeamMembers(members)

      expect(core.info).toHaveBeenCalledWith('Validation complete:')
      expect(core.info).toHaveBeenCalledWith('  Valid members: 1')
      expect(core.info).toHaveBeenCalledWith('  Invalid members: 1')
    })
  })

  describe('clearCache', () => {
    it('should clear the user cache', async () => {
      const members: TeamMember[] = [
        { user: 'user@example.com', relationship: 'ADMIN' }
      ]

      const mockUser: VeracodeUser = {
        user_id: 'user-1',
        user_name: 'user',
        email_address: 'user@example.com',
        active: true,
        login_enabled: true,
        account_type: 'USER'
      }

      mockGetUsers.mockResolvedValue({
        users: [mockUser],
        page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
      })

      // First validation
      await validator.validateTeamMembers(members)
      expect(mockGetUsers).toHaveBeenCalledTimes(1)

      // Clear cache
      validator.clearCache()

      // Second validation should call API again
      await validator.validateTeamMembers(members)
      expect(mockGetUsers).toHaveBeenCalledTimes(2)
    })
  })

  describe('getCacheSize', () => {
    it('should return cache size', async () => {
      expect(validator.getCacheSize()).toBe(0)

      const members: TeamMember[] = [
        { user: 'user1@example.com', relationship: 'ADMIN' },
        { user: 'user2@example.com', relationship: 'MEMBER' }
      ]

      const mockUsers: VeracodeUser[] = [
        {
          user_id: 'user-1',
          user_name: 'user1',
          email_address: 'user1@example.com',
          active: true,
          login_enabled: true,
          account_type: 'USER'
        },
        {
          user_id: 'user-2',
          user_name: 'user2',
          email_address: 'user2@example.com',
          active: true,
          login_enabled: true,
          account_type: 'USER'
        }
      ]

      mockGetUsers
        .mockResolvedValueOnce({
          users: [mockUsers[0]],
          page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
        })
        .mockResolvedValueOnce({
          users: [mockUsers[1]],
          page: { size: 50, totalElements: 1, totalPages: 1, number: 0 }
        })

      await validator.validateTeamMembers(members)

      expect(validator.getCacheSize()).toBe(2)
    })
  })
})
