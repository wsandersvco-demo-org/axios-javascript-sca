/**
 * Utility functions for Veracode Create Teams Action
 */

/**
 * Normalizes an email address to lowercase
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Delays execution for a specified number of milliseconds
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
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

/**
 * Sanitizes log output to prevent log injection attacks (CWE-117)
 * Removes or escapes control characters that could be used to forge log entries
 * Specifically targets newline, carriage return, and other control characters
 * @param input - The string to sanitize
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLog(input: string | undefined | null): string {
  if (input === null || input === undefined || input === '') {
    return ''
  }

  // Convert to string and remove/replace dangerous characters
  let sanitized = String(input)

  // Remove carriage return and line feed to prevent log forging
  sanitized = sanitized.replace(/\r/g, '')
  sanitized = sanitized.replace(/\n/g, '')

  // Replace other control characters with space to maintain readability
  // Control chars: 0x00-0x1F (except \t which is safe) and 0x7F DEL
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ' ')

  return sanitized
}
