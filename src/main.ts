/**
 * Main entry point for the Veracode Create Teams Action
 */

import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import yaml, { CORE_SCHEMA } from 'js-yaml'
import { ConfigurationResolver } from './config/resolver.js'
import { validateMapping } from './config/validator.js'
import { ErrorCategory, VeracodeActionError } from './errors.js'
import { GitHubService } from './services/github-service.js'
import { TeamService } from './services/team-service.js'
import { UserValidator } from './services/user-validator.js'
import type { ActionInputs, ActionOutputs, TeamConfiguration } from './types.js'
import { executeWithRetry } from './utils/retry.js'
import { sanitizeForLog } from './utils.js'
import { VeracodeClient } from './veracode/client.js'

type Octokit = ReturnType<typeof getOctokit>

/**
 * Fetches a file from a GitHub repository
 * @param options - Configuration for fetching the file
 * @returns File content as a string
 * @throws Error if file cannot be fetched
 */
async function fetchFileFromRepo(
  options: {
    owner: string
    path: string
    ref: string | undefined
    repository: string
  },
  octokit: Octokit
): Promise<string> {
  const { owner, path, ref, repository } = options

  try {
    core.info(
      `Fetching file: ${path} from ${owner}/${repository}${ref ? ` (ref: ${ref})` : ''}`
    )

    const response = await octokit.rest.repos.getContent({
      owner,
      path,
      repo: repository,
      ...(ref && { ref })
    })

    if (!('content' in response.data) || Array.isArray(response.data)) {
      throw new Error(
        `Path ${owner}/${repository}/${path} is a directory, not a file`
      )
    }

    const content = Buffer.from(response.data.content, 'base64').toString(
      'utf-8'
    )

    core.info(`Successfully fetched file (${response.data.size} bytes)`)
    return content
  } catch (error) {
    throw new VeracodeActionError(
      `Failed to fetch file from ${owner}/${repository}/${path}`,
      ErrorCategory.CONFIGURATION,
      false,
      undefined,
      error as Error
    )
  }
}

/**
 * Retrieves and validates all action inputs from GitHub Actions context
 * @returns Object containing all required and optional action inputs
 */
function getInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    veracodeApiId: core.getInput('veracode-api-id', { required: true }),
    veracodeApiKey: core.getInput('veracode-api-key', { required: true }),
    repository: core.getInput('repository', { required: true }),
    owner: core.getInput('owner', { required: true }),
    configRepository:
      core.getInput('config-repository', { required: false }) || 'veracode',
    configRef: core.getInput('config-ref', { required: false }) || undefined,
    mappingPath:
      core.getInput('veracode-team-mapping-yaml', { required: false }) ||
      'team-mapping.yaml',
    veracodeRegion:
      (core.getInput('veracode-region', { required: false }) as
        | 'US'
        | 'EU'
        | 'FEDERAL') || 'US'
  }
}

/**
 * Sets all action outputs in GitHub Actions context
 * @param outputs - Object containing all output values to set
 */
function setOutputs(outputs: ActionOutputs): void {
  core.setOutput('team-id', outputs.teamId)
  core.setOutput('team-name', outputs.teamName)
  core.setOutput('team-legacy-id', outputs.teamLegacyId)
  core.setOutput('action-taken', outputs.actionTaken)
  core.setOutput('member-count', outputs.memberCount)
  core.setOutput('members-added', outputs.membersAdded)
  core.setOutput('members-skipped', outputs.membersSkipped)
  core.setOutput('skipped-users', outputs.skippedUsers.join(','))

  core.info('Outputs set successfully')
  core.info(`Team ID: ${sanitizeForLog(outputs.teamId)}`)
  core.info(`Team Name: ${sanitizeForLog(outputs.teamName)}`)
  core.info(`Action: ${outputs.actionTaken}`)
  core.info(`Members Added: ${outputs.membersAdded}`)
  core.info(`Members Skipped: ${outputs.membersSkipped}`)
}

/**
 * Writes a summary of the action results to GitHub Actions step summary
 * @param outputs - Action outputs to include in the summary
 */
async function writeSummary(outputs: ActionOutputs): Promise<void> {
  core.summary.addHeading('Veracode Team Sync Complete').addTable([
    [
      { data: 'Property', header: true },
      { data: 'Value', header: true }
    ],
    ['Team Name', outputs.teamName],
    ['Team ID', outputs.teamId],
    ['Action', outputs.actionTaken],
    ['Members Added', outputs.membersAdded.toString()],
    ['Members Skipped', outputs.membersSkipped.toString()]
  ])

  if (outputs.skippedUsers.length > 0) {
    core.summary.addHeading('Skipped Users', 3).addList(outputs.skippedUsers)
  }

  await core.summary.write()
}

/**
 * Writes an error summary to GitHub Actions step summary
 * @param error - The error that occurred
 */
async function writeErrorSummary(error: Error): Promise<void> {
  core.summary.addHeading('Action Failed').addCodeBlock(error.message, 'text')

  if (error.stack) {
    core.summary.addDetails('Stack Trace', error.stack)
  }

  await core.summary.write()
}

/**
 * Main entry point for the GitHub Action
 * Orchestrates team creation/update workflow including:
 * - Fetching and validating configuration
 * - Validating team members
 * - Creating or updating Veracode teams
 * - Syncing GitHub collaborators (if enabled)
 * - Setting outputs and writing summary
 * @throws Error if action fails (errors are caught and logged)
 */
export async function run(): Promise<void> {
  try {
    core.startGroup('Validating inputs')
    const inputs = getInputs()
    core.info(`Repository: ${inputs.owner}/${inputs.repository}`)
    core.info(
      `Config: ${inputs.owner}/${inputs.configRepository}/${inputs.mappingPath}${inputs.configRef ? ` (ref: ${inputs.configRef})` : ''}`
    )
    core.info(`Region: ${inputs.veracodeRegion}`)
    core.endGroup()

    core.startGroup('Initializing clients')
    const octokit = getOctokit(inputs.githubToken)
    const veracodeClient = new VeracodeClient(
      inputs.veracodeApiId,
      inputs.veracodeApiKey,
      inputs.veracodeRegion
    )
    const userValidator = new UserValidator(veracodeClient)
    const teamService = new TeamService(veracodeClient)
    const githubService = new GitHubService(octokit)
    core.info('Clients initialized successfully')
    core.endGroup()

    core.startGroup('Loading team mapping configuration')
    const fileContent = await fetchFileFromRepo(
      {
        owner: inputs.owner,
        path: inputs.mappingPath,
        ref: inputs.configRef,
        repository: inputs.configRepository
      },
      octokit
    )
    const rawMapping = yaml.load(fileContent, { schema: CORE_SCHEMA })
    const mapping = validateMapping(rawMapping)
    core.info('Configuration loaded and validated')
    core.endGroup()

    core.startGroup('Resolving team configuration')
    const resolver = new ConfigurationResolver(mapping)
    let teamConfig: TeamConfiguration = resolver.resolveTeamConfiguration(
      inputs.repository
    )
    core.info(`Team name: ${teamConfig.team_name}`)
    core.info(`Base members: ${teamConfig.members.length}`)
    core.endGroup()

    if (teamConfig.sync_github_collaborators) {
      core.startGroup('Fetching GitHub collaborators')
      const githubMembers = await githubService.fetchCollaborators(
        inputs.owner,
        inputs.repository,
        teamConfig.github_collaborator_filter
      )
      core.info(`Found ${githubMembers.length} GitHub collaborators`)

      const mergedMembers = GitHubService.mergeMembers(
        teamConfig.members,
        githubMembers
      )
      teamConfig = { ...teamConfig, members: mergedMembers }
      core.info(`Total members after merge: ${teamConfig.members.length}`)
      core.endGroup()
    }

    core.startGroup('Validating users against Veracode platform')
    const validationResult = await userValidator.validateTeamMembers(
      teamConfig.members
    )

    if (validationResult.invalidMembers.length > 0) {
      core.warning(
        `${validationResult.invalidMembers.length} users will be skipped ` +
          `(not found or inactive in Veracode)`
      )
    }

    teamConfig = {
      ...teamConfig,
      members: validationResult.validMembers
    }
    core.endGroup()

    core.startGroup('Checking if team exists')
    const existingTeam = await executeWithRetry(
      () => teamService.findTeamByName(teamConfig.team_name),
      'Find team by name'
    )
    core.endGroup()

    let team
    let actionTaken: 'created' | 'updated' | 'skipped'

    if (!existingTeam) {
      core.startGroup('Creating new team')
      team = await executeWithRetry(
        () => teamService.createTeam(teamConfig),
        'Create team'
      )
      actionTaken = 'created'
      core.info(
        `Team created: ${sanitizeForLog(team.team_name)} (${sanitizeForLog(team.team_id)})`
      )
      core.endGroup()
    } else if (teamConfig.members.length === 0) {
      // Skip update if there are no valid members for an existing team
      core.startGroup('Skipping team update')
      core.info(
        `No valid members to add. Skipping update for existing team: ${sanitizeForLog(teamConfig.team_name)}`
      )
      // Use the existing team details
      team = existingTeam
      actionTaken = 'skipped'
      core.info(
        `Team unchanged: ${sanitizeForLog(team.team_name)} (${sanitizeForLog(team.team_id)})`
      )
      core.endGroup()
    } else {
      core.startGroup('Updating existing team')
      team = await executeWithRetry(
        () => teamService.updateTeam(existingTeam.team_id, teamConfig),
        'Update team'
      )
      actionTaken = 'updated'
      core.info(
        `Team updated: ${sanitizeForLog(team.team_name)} (${sanitizeForLog(team.team_id)})`
      )
      core.endGroup()
    }

    // 9. Set outputs and write summary
    core.startGroup('Setting outputs')
    const outputs: ActionOutputs = {
      teamId: team.team_id,
      teamName: team.team_name,
      teamLegacyId: team.team_legacy_id,
      actionTaken,
      memberCount: team.user_count || validationResult.validMembers.length,
      membersAdded: validationResult.validMembers.length,
      membersSkipped: validationResult.invalidMembers.length,
      skippedUsers: validationResult.invalidMembers.map((m) => m.user)
    }
    setOutputs(outputs)
    core.endGroup()

    await writeSummary(outputs)
  } catch (error) {
    const err = error as Error
    core.setFailed(err.message)
    await writeErrorSummary(err)
  }
}
