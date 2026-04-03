# Veracode Create Teams Action

![Linter](https://github.com/wsandersvc/veracode-create-teams-action/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/wsandersvc/veracode-create-teams-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/wsandersvc/veracode-create-teams-action/actions/workflows/check-dist.yml/badge.svg)
![CodeQL](https://github.com/wsandersvc/veracode-create-teams-action/actions/workflows/codeql-analysis.yml/badge.svg)
![Coverage](./badges/coverage.svg)

A GitHub Action that automatically creates and manages Veracode teams based on
repository configurations. This action integrates with the Veracode Identity API
to ensure teams exist and are properly configured with validated members.

## Features

- **Automatic Team Management** - Create and update Veracode teams seamlessly
- **User Validation** - Validates all users against Veracode platform before
  adding to teams
- **GitHub Collaborator Sync** - Optionally synchronize repository collaborators
- **Wildcard Pattern Matching** - Support for pattern-based repository mapping
- **Incremental Updates** - Non-destructive updates that preserve existing
  members
- **Multi-Region Support** - Works with US, EU, and Federal Veracode instances
- **Comprehensive Error Handling** - Retry logic with exponential backoff
- **Flexible Configuration** - Centralized YAML-based team mapping

## Table of Contents

- [Quick Start](#quick-start)
- [Usage Examples](#usage-examples)
- [Configuration](#configuration)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [Team Mapping YAML Schema](#team-mapping-yaml-schema)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)
- [Contributing](#contributing)

## Quick Start

### Basic Setup

1. **Create a team mapping file** in your configuration repository (default:
   `veracode` repository):

```yaml
# team-mapping.yaml
version: '1.0'

mappings:
  my-application:
    team_name: 'My Application Security Team'
    description: 'Security team for my application'
    business_unit: 'Engineering'
    members:
      - user: 'security-admin@example.com'
        relationship: 'ADMIN'
      - user: 'developer@example.com'
        relationship: 'MEMBER'
```

1. **Add the action to your workflow**:

```yaml
name: Sync Veracode Team
on: [push]

jobs:
  sync-team:
    runs-on: ubuntu-latest
    steps:
      - name: Create/Update Veracode Team
        uses: your-org/veracode-create-teams-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          veracode-api-id: ${{ secrets.VERACODE_API_ID }}
          veracode-api-key: ${{ secrets.VERACODE_API_KEY }}
          repository: ${{ github.event.repository.name }}
          owner: ${{ github.repository_owner }}
```

## Usage Examples

### Example 1: Basic Team Creation

```yaml
- name: Create Veracode Team
  uses: your-org/veracode-create-teams-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    veracode-api-id: ${{ secrets.VERACODE_API_ID }}
    veracode-api-key: ${{ secrets.VERACODE_API_KEY }}
    repository: my-app
    owner: my-org
```

### Example 2: Custom Configuration Repository

```yaml
- name: Create Veracode Team with Custom Config
  uses: your-org/veracode-create-teams-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    veracode-api-id: ${{ secrets.VERACODE_API_ID }}
    veracode-api-key: ${{ secrets.VERACODE_API_KEY }}
    repository: ${{ github.event.repository.name }}
    owner: ${{ github.repository_owner }}
    config-repository: .security-config
    config-ref: main
    veracode-team-mapping-yaml: teams/mapping.yaml
```

### Example 3: EU Region Instance

```yaml
- name: Create Veracode Team (EU)
  uses: your-org/veracode-create-teams-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    veracode-api-id: ${{ secrets.VERACODE_API_ID_EU }}
    veracode-api-key: ${{ secrets.VERACODE_API_KEY_EU }}
    repository: ${{ github.event.repository.name }}
    owner: ${{ github.repository_owner }}
    veracode-region: EU
```

### Example 4: With Result Handling

```yaml
- name: Create/Update Veracode Team
  id: veracode-team
  uses: your-org/veracode-create-teams-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    veracode-api-id: ${{ secrets.VERACODE_API_ID }}
    veracode-api-key: ${{ secrets.VERACODE_API_KEY }}
    repository: ${{ github.event.repository.name }}
    owner: ${{ github.repository_owner }}

- name: Report Results
  run: |
    echo "Team: ${{ steps.veracode-team.outputs.team-name }}"
    echo "Team ID: ${{ steps.veracode-team.outputs.team-id }}"
    echo "Action: ${{ steps.veracode-team.outputs.action-taken }}"
    echo "Members Added: ${{ steps.veracode-team.outputs.members-added }}"
    echo "Members Skipped: ${{ steps.veracode-team.outputs.members-skipped }}"

- name: Handle Skipped Users
  if: steps.veracode-team.outputs.members-skipped > 0
  run: |
    echo "Warning: Some users were not added to the team"
    echo "Skipped users: ${{ steps.veracode-team.outputs.skipped-users }}"
```

### Example 5: Create Issue for Skipped Users

```yaml
- name: Create/Update Veracode Team
  id: veracode-team
  uses: your-org/veracode-create-teams-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    veracode-api-id: ${{ secrets.VERACODE_API_ID }}
    veracode-api-key: ${{ secrets.VERACODE_API_KEY }}
    repository: ${{ github.event.repository.name }}
    owner: ${{ github.repository_owner }}

- name: Create Issue for Skipped Users
  if: steps.veracode-team.outputs.members-skipped > 0
  uses: actions/github-script@v7
  with:
    script: |
      const skippedUsers = '${{ steps.veracode-team.outputs.skipped-users }}'.split(',')
      const body = `
      ## Veracode Team Sync - Users Not Found

      The following users could not be added to the Veracode team:

      ${skippedUsers.map(u => `- ${u}`).join('
')}

      ### Action Required

      Please ensure these users are invited to the Veracode platform first.

      **Team:** ${{ steps.veracode-team.outputs.team-name }}
      **Members Added:** ${{ steps.veracode-team.outputs.members-added }}
      **Members Skipped:** ${{ steps.veracode-team.outputs.members-skipped }}
      `

      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: 'Veracode Team Sync: Users Not Found',
        body: body,
        labels: ['veracode', 'team-management']
      })
```

## Configuration

### Team Mapping YAML Schema

The team mapping configuration file (`team-mapping.yaml`) defines how
repositories map to Veracode teams.

#### Complete Example

```yaml
# team-mapping.yaml
version: '1.0'

# Global default settings (optional)
defaults:
  business_unit: 'Engineering'

# Repository-to-Team Mappings
mappings:
  # Exact repository name match
  my-application:
    team_name: 'My Application Security Team'
    description: 'Security team for my application'
    business_unit: 'Engineering'
    members:
      - user: 'security-admin@example.com'
        relationship: 'ADMIN'
      - user: 'developer@example.com'
        relationship: 'MEMBER'
    # Optional: Sync GitHub collaborators
    sync_github_collaborators: true
    github_collaborator_filter:
      - 'admin'
      - 'write'

  another-repo:
    team_name: 'Another Team'
    description: 'Another security team'
    members:
      - user: 'team-lead@example.com'
        relationship: 'ADMIN'

  # Wildcard pattern matching
  'api-*':
    team_name: 'API Services Security Team'
    description: 'Team for all API services'
    members:
      - user: 'api-security@example.com'
        relationship: 'ADMIN'

# Fallback configuration (optional)
fallback:
  auto_create: true
  team_name_template: '{repository_name} Security Team'
  default_members:
    - user: 'default-admin@example.com'
      relationship: 'ADMIN'
```

#### Schema Fields

**Root Level:**

- `version` (required): Schema version (currently "1.0")
- `defaults` (optional): Default settings applied to all teams
- `mappings` (required): Repository-to-team mapping configurations
- `fallback` (optional): Fallback behavior when no mapping matches

**Default Settings:**

- `business_unit` (optional): Default business unit for all teams

**Team Configuration:**

- `team_name` (required): Name of the Veracode team
- `description` (optional): Team description
- `business_unit` (optional): Business unit name
- `members` (required): Array of team members
  - `user` (required): Email address or username
  - `relationship` (required): Either "ADMIN" or "MEMBER"
- `sync_github_collaborators` (optional): Sync GitHub collaborators
- `github_collaborator_filter` (optional): Filter collaborators by permission
  level
  - Valid values: "admin", "write", "read"

**Fallback Configuration:**

- `auto_create` (required): Whether to auto-create teams
- `team_name_template` (optional): Template for team names (supports
  `{repository_name}`)
- `default_members` (optional): Default members for auto-created teams

## Inputs

| Input                        | Description                                      | Required | Default             |
| ---------------------------- | ------------------------------------------------ | -------- | ------------------- |
| `github-token`               | GitHub token with repository access              | Yes      | -                   |
| `veracode-api-id`            | Veracode API ID for authentication               | Yes      | -                   |
| `veracode-api-key`           | Veracode API Key for authentication              | Yes      | -                   |
| `repository`                 | GitHub repository name                           | Yes      | -                   |
| `owner`                      | GitHub repository owner                          | Yes      | -                   |
| `config-repository`          | Repository containing team mapping config        | No       | `veracode`          |
| `config-ref`                 | Branch, tag, or commit SHA for config repository | No       | Default branch      |
| `veracode-team-mapping-yaml` | Path to team mapping YAML file                   | No       | `team-mapping.yaml` |
| `veracode-region`            | Veracode region (US, EU, or FEDERAL)             | No       | `US`                |

### Input Details

#### `github-token`

GitHub token used to authenticate with the GitHub API. Requires read access to
repositories.

**Example:**

```yaml
github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### `veracode-api-id` and `veracode-api-key`

Veracode API credentials for HMAC-SHA256 authentication. Store these as GitHub
Secrets.

**Permissions Required:**

- `Administrator` role

**Example:**

```yaml
veracode-api-id: ${{ secrets.VERACODE_API_ID }}
veracode-api-key: ${{ secrets.VERACODE_API_KEY }}
```

#### `repository` and `owner`

The repository name and owner to process. Used to look up the team
configuration.

**Example:**

```yaml
repository: ${{ github.event.repository.name }}
owner: ${{ github.repository_owner }}
```

#### `config-repository`

The repository containing the `team-mapping.yaml` configuration file.

**Example:**

```yaml
config-repository: security-config
```

#### `veracode-region`

The Veracode instance region. Valid values: `US`, `EU`, `FEDERAL`

**Region Endpoints:**

- `US`: Commercial US instance (api.veracode.com)
- `EU`: European instance (api.veracode.eu)
- `FEDERAL`: US Federal instance (api.fed.veracode.us)

**Example:**

```yaml
veracode-region: EU
```

## Outputs

| Output            | Description                                       | Example                                |
| ----------------- | ------------------------------------------------- | -------------------------------------- |
| `team-id`         | UUID of the created/updated team                  | `550e8400-e29b-41d4-a716-446655440000` |
| `team-name`       | Name of the created/updated team                  | `My Application Security Team`         |
| `team-legacy-id`  | Legacy ID of the team                             | `12345`                                |
| `action-taken`    | Action performed                                  | `created` or `updated` or `skipped`    |
| `member-count`    | Total number of members in the team               | `5`                                    |
| `members-added`   | Number of members successfully added/validated    | `3`                                    |
| `members-skipped` | Number of members skipped (not found in Veracode) | `2`                                    |
| `skipped-users`   | Comma-separated list of users that were skipped   | `user1@example.com,user2@example.com`  |

### Using Outputs

```yaml
- name: Create Veracode Team
  id: team
  uses: your-org/veracode-create-teams-action@v1
  with:
    # ... inputs ...

- name: Use Outputs
  run: |
    echo "Team ID: ${{ steps.team.outputs.team-id }}"
    echo "Team Name: ${{ steps.team.outputs.team-name }}"
```

## Examples

### Example 1: Simple Team Mapping

```yaml
# team-mapping.yaml
version: '1.0'

mappings:
  web-application:
    team_name: 'Web App Security Team'
    members:
      - user: 'security@example.com'
        relationship: 'ADMIN'
```

### Example 2: Multiple Teams with Defaults

```yaml
# team-mapping.yaml
version: '1.0'

defaults:
  business_unit: 'Engineering'

mappings:
  frontend-app:
    team_name: 'Frontend Security Team'
    members:
      - user: 'frontend-lead@example.com'
        relationship: 'ADMIN'
      - user: 'frontend-dev@example.com'
        relationship: 'MEMBER'

  backend-app:
    team_name: 'Backend Security Team'
    members:
      - user: 'backend-lead@example.com'
        relationship: 'ADMIN'
      - user: 'backend-dev@example.com'
        relationship: 'MEMBER'
```

### Example 3: GitHub Collaborator Sync

```yaml
# team-mapping.yaml
version: '1.0'

mappings:
  my-repo:
    team_name: 'My Repo Security Team'
    sync_github_collaborators: true
    github_collaborator_filter:
      - 'admin'
      - 'write'
    members:
      # Additional members not in GitHub
      - user: 'external-security@example.com'
        relationship: 'ADMIN'
```

### Example 4: Wildcard Patterns

```yaml
# team-mapping.yaml
version: '1.0'

mappings:
  # All API services
  'api-*':
    team_name: 'API Services Team'
    members:
      - user: 'api-team@example.com'
        relationship: 'ADMIN'

  # All microservices
  '*-service':
    team_name: 'Microservices Team'
    members:
      - user: 'microservices-team@example.com'
        relationship: 'ADMIN'
```

### Example 5: Fallback Configuration

```yaml
# team-mapping.yaml
version: '1.0'

mappings:
  important-app:
    team_name: 'Important App Team'
    members:
      - user: 'team-lead@example.com'
        relationship: 'ADMIN'

# Auto-create teams for unmapped repositories
fallback:
  auto_create: true
  team_name_template: '{repository_name} Security Team'
  default_members:
    - user: 'default-security@example.com'
      relationship: 'ADMIN'
```

## Troubleshooting

### Common Issues

#### Issue 1: Users Not Found in Veracode

**Problem:** Action reports that users were skipped because they don't exist in
Veracode.

**Solution:**

1. Ensure users are invited to the Veracode platform first
1. Check that email addresses match exactly
1. Verify users have activated their accounts

**Example Output:**

```text
Warning: 2 users will be skipped (not found or inactive in Veracode)
  - newuser@example.com: User does not exist in Veracode platform
  - inactive@example.com: User account is inactive
```

#### Issue 2: Configuration File Not Found

**Problem:** Action fails with "Failed to fetch file" error.

**Solution:**

1. Verify the `config-repository` exists and is accessible
1. Check the `veracode-team-mapping-yaml` path is correct
1. Ensure the GitHub token has read access to the config repository

#### Issue 3: Authentication Failures

**Problem:** Action fails with 401 or 403 errors.

**Solution:**

1. Verify Veracode API credentials are correct
1. Check that credentials have not expired
1. Ensure the API user has Team Admin permissions
1. Verify the correct region is specified

#### Issue 4: No Team Configuration Found

**Problem:** Action fails with "No team configuration found for repository".

**Solution:**

1. Add an entry for the repository in the mapping file
1. Use wildcard patterns to match multiple repositories
1. Configure a fallback auto-create setting

### Debug Mode

Enable debug logging to get detailed information:

```yaml
# In repository settings: Settings → Secrets → Actions
# Add secret: ACTIONS_STEP_DEBUG = true
```

### Validation Tips

1. **Validate YAML Syntax:**

```bash
yamllint team-mapping.yaml
```

1. **Test with Minimal Configuration:**

```yaml
version: '1.0'
mappings:
  test-repo:
    team_name: 'Test Team'
    members:
      - user: 'test@example.com'
        relationship: 'ADMIN'
```

1. **Check Action Logs:**

- Review info messages about team creation/updates
- Look for warnings about skipped users
- Check for error details in failed runs

## Requirements

### Software Requirements

- **Node.js:** 24.0.0 or higher (24.14.0 recommended)
- **GitHub Actions:** Runner with ubuntu-latest or equivalent

### Veracode Requirements

- **Veracode API Credentials:**
  - API ID and API Key
  - Administrator permissions (to create teams)

### GitHub Requirements

- **GitHub Token:**
  - `repo` scope for reading repository collaborators and content
  - The default `GITHUB_TOKEN` provided by GitHub Actions has sufficient
    permissions

### Security Considerations

1. **Store credentials as GitHub Secrets:**
   - Never commit API credentials to the repository
   - Use GitHub's encrypted secrets feature

1. **Principle of Least Privilege:**
   - Use API credentials with minimal required permissions
   - Limit token scopes to necessary access

1. **Audit Logging:**
   - The action logs all team creation and update operations
   - Review action logs regularly for security auditing

## Contributing

Contributions are welcome! Please see our contributing guidelines:

1. Fork the repository
1. Create a feature branch (`git checkout -b feature/amazing-feature`)
1. Commit your changes (`git commit -m 'Add amazing feature'`)
1. Push to the branch (`git push origin feature/amazing-feature`)
1. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/veracode-create-teams-action.git
cd veracode-create-teams-action

# Install dependencies
npm install

# Run tests
npm run test

# Bundle the action
npm run bundle

# Format code
npm run format

# Lint code
npm run lint
```

### Code Quality Standards

- Minimum 80% test coverage
- All tests must pass
- Code must pass linting checks
- Follow existing code style and conventions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Additional Resources

- [Veracode Identity API Documentation](https://docs.veracode.com/r/c_identity_intro)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
1. Review
   [GitHub Issues](https://github.com/your-org/veracode-create-teams-action/issues)
1. Open a new issue with:
   - Full error message
   - Sanitized action configuration (no secrets)
   - Steps to reproduce
   - Expected vs actual behavior

---
