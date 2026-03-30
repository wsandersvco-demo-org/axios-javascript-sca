/**
 * Team Service
 *
 * Manages Veracode team operations including lookup, creation, and updates.
 */

import * as core from '@actions/core'
import { VeracodeClient } from '../veracode/client.js'
import type { TeamConfiguration, VeracodeTeam, TeamMember } from '../types.js'

const MAX_PAGES = 100 // Safety limit for pagination
const PAGE_SIZE = 100 // Maximum page size for efficiency

export class TeamService {
  constructor(private veracodeClient: VeracodeClient) {}

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
        core.info(`Found existing team: ${teamName} (${exactMatch.team_id})`)
        return exactMatch
      }

      if (response.teams.length < PAGE_SIZE) break
    }

    core.info(`Team not found: ${teamName}`)
    return null
  }

  async createTeam(config: TeamConfiguration): Promise<VeracodeTeam> {
    core.info(`Creating new team: ${config.team_name}`)

    const team = await this.veracodeClient.createTeam({
      team_name: config.team_name,
      bu_name: config.business_unit,
      member_only: config.member_only ?? false,
      description: config.description
    })

    core.info(`Team created successfully: ${team.team_name} (${team.team_id})`)

    if (config.members.length > 0) {
      core.info(`Adding ${config.members.length} members to team...`)
      await this.updateTeamMembers(team.team_id, team.team_name, config.members)
      core.info(`Members added successfully`)
    }

    return team
  }

  async updateTeam(
    teamId: string,
    config: TeamConfiguration
  ): Promise<VeracodeTeam> {
    core.info(`Updating team: ${config.team_name} (${teamId})`)

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
