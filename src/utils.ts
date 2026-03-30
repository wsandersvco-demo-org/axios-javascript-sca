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
 * Escapes control characters that could be used to forge log entries
 * while keeping normal text readable
 * @param input - The string to sanitize
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLog(input: string | undefined | null): string {
  if (input === null || input === undefined || input === '') {
    return ''
  }

  // Escape control characters that could break log integrity
  // Using hex encoding for control chars (0x00-0x1F and 0x7F DEL)
  // eslint-disable-next-line no-control-regex
  return String(input).replace(/[\x00-\x1F\x7F]/g, (char) => {
    const code = char.charCodeAt(0)
    return `\\x${code.toString(16).padStart(2, '0').toUpperCase()}`
  })
}
