/**
 * Unit tests for utility functions (src/utils.ts)
 */

import { describe, expect, it } from '@jest/globals'
import {
  normalizeEmail,
  sleep,
  interpolateTemplate,
  sanitizeForLog
} from '../src/utils.js'

describe('utils.ts', () => {
  describe('normalizeEmail', () => {
    it('should convert email to lowercase', () => {
      expect(normalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com')
    })

    it('should trim whitespace', () => {
      expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com')
    })

    it('should handle already normalized email', () => {
      expect(normalizeEmail('user@example.com')).toBe('user@example.com')
    })

    it('should handle mixed case', () => {
      expect(normalizeEmail('UsEr@ExAmPlE.CoM')).toBe('user@example.com')
    })
  })

  describe('sleep', () => {
    it('should resolve after specified duration', async () => {
      const start = Date.now()
      await sleep(100)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(95) // Allow small variance
      expect(elapsed).toBeLessThan(200)
    })

    it('should resolve immediately for zero duration', async () => {
      const start = Date.now()
      await sleep(0)
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(50)
    })
  })

  describe('interpolateTemplate', () => {
    it('should replace single variable', () => {
      const result = interpolateTemplate('{name} Team', { name: 'MyApp' })
      expect(result).toBe('MyApp Team')
    })

    it('should replace multiple variables', () => {
      const result = interpolateTemplate('{org}/{repo}', {
        org: 'myorg',
        repo: 'myrepo'
      })
      expect(result).toBe('myorg/myrepo')
    })

    it('should leave undefined variables unchanged', () => {
      const result = interpolateTemplate('{name} {other}', { name: 'Test' })
      expect(result).toBe('Test {other}')
    })

    it('should handle no variables', () => {
      const result = interpolateTemplate('No variables here', {})
      expect(result).toBe('No variables here')
    })

    it('should handle empty template', () => {
      const result = interpolateTemplate('', { name: 'Test' })
      expect(result).toBe('')
    })

    it('should handle duplicate variables', () => {
      const result = interpolateTemplate('{name}-{name}', { name: 'Test' })
      expect(result).toBe('Test-Test')
    })
  })

  describe('sanitizeForLog', () => {
    it('should remove carriage return characters', () => {
      const input = 'Hello\rWorld'
      const result = sanitizeForLog(input)
      expect(result).toBe('HelloWorld')
      expect(result).not.toContain('\r')
    })

    it('should remove line feed characters', () => {
      const input = 'Hello\nWorld'
      const result = sanitizeForLog(input)
      expect(result).toBe('HelloWorld')
      expect(result).not.toContain('\n')
    })

    it('should remove both CRLF sequences', () => {
      const input = 'Hello\r\nWorld'
      const result = sanitizeForLog(input)
      expect(result).toBe('HelloWorld')
      expect(result).not.toContain('\r')
      expect(result).not.toContain('\n')
    })

    it('should handle multiple newlines and carriage returns', () => {
      const input = 'Line1\nLine2\rLine3\r\nLine4'
      const result = sanitizeForLog(input)
      expect(result).toBe('Line1Line2Line3Line4')
      expect(result).not.toContain('\n')
      expect(result).not.toContain('\r')
    })

    it('should handle null input', () => {
      const result = sanitizeForLog(null)
      expect(result).toBe('')
    })

    it('should handle undefined input', () => {
      const result = sanitizeForLog(undefined)
      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = sanitizeForLog('')
      expect(result).toBe('')
    })

    it('should not alter normal text without control characters', () => {
      const input = 'Normal text with spaces and punctuation!'
      const result = sanitizeForLog(input)
      expect(result).toBe(input)
    })

    it('should prevent log injection attack', () => {
      // Simulated attack: injecting fake log entries
      const maliciousInput = 'user123\n[INFO] Fake admin login successful'
      const result = sanitizeForLog(maliciousInput)
      // Newlines are removed to prevent log forging
      expect(result).toBe('user123[INFO] Fake admin login successful')
      expect(result).not.toContain('\n')
      expect(result).not.toContain('\r')
    })

    it('should handle complex attack vectors', () => {
      const maliciousInput =
        'TeamName\r\n2026-03-30 ERROR: System compromised\r\n'
      const result = sanitizeForLog(maliciousInput)
      // All CR/LF are removed
      expect(result).not.toContain('\n')
      expect(result).not.toContain('\r')
      expect(result).toBe('TeamName2026-03-30 ERROR: System compromised')
    })

    it('should replace other control characters with spaces', () => {
      // Test null byte, backspace, and other control chars
      const input = 'Text\x00with\x08control\x1Bchars'
      const result = sanitizeForLog(input)
      expect(result).toBe('Text with control chars')
      // eslint-disable-next-line no-control-regex
      expect(result).not.toMatch(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/)
    })
  })
})
