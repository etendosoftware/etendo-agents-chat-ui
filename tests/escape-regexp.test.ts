import { describe, it, expect } from 'vitest'
import { escapeRegExp } from '../lib/utils/escape-regexp'

describe('escapeRegExp', () => {
  it('returns empty string unchanged', () => {
    expect(escapeRegExp('')).toBe('')
  })

  it('returns plain alphanumeric strings unchanged', () => {
    expect(escapeRegExp('hello123')).toBe('hello123')
  })

  it('escapes dot', () => {
    expect(escapeRegExp('example.com')).toBe('example\\.com')
  })

  it('escapes all regex metacharacters', () => {
    expect(escapeRegExp('-/\\^$*+?.()|[]{}'))
      .toBe('\\-\\/\\\\\\^\\$\\*\\+\\?\\.\\(\\)\\|\\[\\]\\{\\}')
  })

  it('escapes email with plus addressing (test+tag@example.com)', () => {
    const result = escapeRegExp('test+tag@example.com')
    expect(result).toBe('test\\+tag@example\\.com')
    // The resulting regex should match the original email exactly
    expect(new RegExp(`^${result}$`, 'i').test('test+tag@example.com')).toBe(true)
    // And not match without the plus
    expect(new RegExp(`^${result}$`, 'i').test('testxtag@example.com')).toBe(false)
  })

  it('escapes dot-separated subdomains in email', () => {
    const result = escapeRegExp('user.name@sub.example.co.uk')
    expect(result).toBe('user\\.name@sub\\.example\\.co\\.uk')
    expect(new RegExp(`^${result}$`, 'i').test('user.name@sub.example.co.uk')).toBe(true)
  })

  it('escapes square brackets (IP literal emails)', () => {
    const result = escapeRegExp('user@[127.0.0.1]')
    expect(result).toBe('user@\\[127\\.0\\.0\\.1\\]')
  })

  it('escapes forward slash', () => {
    expect(escapeRegExp('path/to/file')).toBe('path\\/to\\/file')
  })

  it('escapes backslash', () => {
    expect(escapeRegExp('C:\\Users\\test')).toBe('C:\\\\Users\\\\test')
  })

  it('escapes pipe character', () => {
    expect(escapeRegExp('a|b')).toBe('a\\|b')
  })

  it('escapes question mark and asterisk', () => {
    expect(escapeRegExp('file?.txt')).toBe('file\\?\\.txt')
    expect(escapeRegExp('glob*')).toBe('glob\\*')
  })

  it('escapes parentheses', () => {
    expect(escapeRegExp('(group)')).toBe('\\(group\\)')
  })

  it('escapes caret and dollar sign', () => {
    expect(escapeRegExp('^start$end')).toBe('\\^start\\$end')
  })

  it('does not alter unicode characters', () => {
    // Unicode letters are not regex metacharacters, should pass through
    expect(escapeRegExp('café@example.com')).toBe('café@example\\.com')
    expect(new RegExp(`^${escapeRegExp('café@example.com')}$`, 'i').test('café@example.com')).toBe(true)
  })

  it('handles string with only special characters', () => {
    const result = escapeRegExp('.*+?')
    expect(result).toBe('\\.\\*\\+\\?')
    // The escaped result used in a regex should not throw
    expect(() => new RegExp(result)).not.toThrow()
  })
})
