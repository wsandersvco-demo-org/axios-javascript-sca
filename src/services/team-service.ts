/**
 * Team Service
 *
 * Manages Veracode team operations including lookup, creation, and updates.
 */

import * as core from '@actions/core'
import { VeracodeClient } from '../veracode/client.js'
import type { TeamConfiguration, TeamMember, VeracodeTeam } from '../types.js'
import { sanitizeForLog } from '../utils.js'

const MAX_PAGES = 100 // Safety limit for pagination
const PAGE_SIZE = 100 // Maximum page size for efficiency

export class TeamService {
  constructor(private veracodeClient: VeracodeClient) {}

  /**
   * Finds a team by exact name match
   * @param teamName - The exact name of the team to find
   * @returns The team if found, null otherwise
   */
  async findTeamByName(teamName: string): Promise<VeracodeTeam | null> {
    core.info(`Searching for team: ${teamName}`)

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.veracodeClient.getTeams({
        pageable: { page, size: PAGE_SIZE },
        team_name: teamName,
        ignore_self_teams: true
      })

      const exactMatch = response.teams.find(
        (team) => team.team_name === teamName
      )

      if (exactMatch) {
        core.info(
          `Found existing team: ${sanitizeForLog(teamName)} (${sanitizeForLog(exactMatch.team_id)})`
        )
        return exactMatch
      }

      if (response.teams.length < PAGE_SIZE) break
    }

    core.info(`Team not found: ${teamName}`)
    return null
  }

  /**
   * Creates a new team in Veracode with the specified configuration
   * @param config - Team configuration including name, members, and settings
   * @returns The newly created team
   */
  async createTeam(config: TeamConfiguration): Promise<VeracodeTeam> {
    core.info(`Creating new team: ${config.team_name}`)

    const team = await this.veracodeClient.createTeam({
      team_name: config.team_name,
      bu_name: config.business_unit,
      member_only: config.member_only ?? false,
      description: config.description
    })

    core.info(
      `Team created successfully: ${sanitizeForLog(team.team_name)} (${sanitizeForLog(team.team_id)})`
    )

    if (config.members.length > 0) {
      core.info(`Adding ${config.members.length} members to team...`)
      await this.updateTeamMembers(team.team_id, team.team_name, config.members)
      core.info(`Members added successfully`)
    }

    return team
  }

  /**
   * Updates an existing team with new configuration
   * Uses incremental updates to preserve existing members
   * @param teamId - The ID of the team to update
   * @param config - New team configuration
   * @returns The updated team
   */
  async updateTeam(
    teamId: string,
    config: TeamConfiguration
  ): Promise<VeracodeTeam> {
    core.info(
      `Updating team: ${sanitizeForLog(config.team_name)} (${sanitizeForLog(teamId)})`
    )

    const updatedTeam = await this.veracodeClient.updateTeam(
      teamId,
      {
        team_name: config.team_name,
        bu_name: config.business_unit,
        member_only: config.member_only,
        description: config.description,
        users: config.members.map((m) => ({
          user_name: m.user,
          relationship: m.relationship
        }))
      },
      {
        partial: true,
        incremental: true
      }
    )

    core.info(
      `Team updated successfully: ${config.members.length} members processed`
    )
    return updatedTeam
  }

  /**
   * Updates team members incrementally (adds without removing existing)
   * @param teamId - The ID of the team
   * @param teamName - The name of the team (for logging)
   * @param members - Array of members to add to the team
   */
  private async updateTeamMembers(
    teamId: string,
    teamName: string,
    members: TeamMember[]
  ): Promise<void> {
    await this.veracodeClient.updateTeam(
      teamId,
      {
        team_name: teamName,
        users: members.map((m) => ({
          user_name: m.user,
          relationship: m.relationship
        }))
      },
      {
        partial: true,
        incremental: true
      }
    )
  }

  /**
   * Creates a new team or updates an existing one based on team name
   * @param config - Team configuration
   * @returns Object containing the team and the action taken ('created' or 'updated')
   */
  async createOrUpdateTeam(
    config: TeamConfiguration
  ): Promise<{ team: VeracodeTeam; action: 'created' | 'updated' }> {
    const existingTeam = await this.findTeamByName(config.team_name)

    if (existingTeam) {
      const team = await this.updateTeam(existingTeam.team_id, config)
      return { team, action: 'updated' }
    }

    const team = await this.createTeam(config)
    return { team, action: 'created' }
  }
}
