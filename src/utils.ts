/**
 * Utility functions for Veracode Create Teams Action
 */

/**
 * Normalizes an email address to lowercase
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Interpolates template variables in a string
 * @example interpolateTemplate("{repository_name} Team", {repository_name: "my-app"}) => "my-app Team"
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] || match
  })
}
