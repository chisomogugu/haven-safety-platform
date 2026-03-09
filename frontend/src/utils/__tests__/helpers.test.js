import { describe, it, expect } from 'vitest'
import {
  getScoreColor,
  getScoreRingColor,
  getSeverityColor,
  getVerdictStyle,
  getCategoryLabel,
  truncate,
  formatDate,
} from '../helpers'

// ─── getScoreColor ────────────────────────────────────────────────────────────

describe('getScoreColor', () => {
  it('returns green for scores >= 80', () => {
    expect(getScoreColor(80)).toBe('text-green-400')
    expect(getScoreColor(100)).toBe('text-green-400')
    expect(getScoreColor(95)).toBe('text-green-400')
  })

  it('returns yellow for scores 50–79', () => {
    expect(getScoreColor(50)).toBe('text-yellow-400')
    expect(getScoreColor(79)).toBe('text-yellow-400')
    expect(getScoreColor(65)).toBe('text-yellow-400')
  })

  it('returns red for scores below 50', () => {
    expect(getScoreColor(0)).toBe('text-red-400')
    expect(getScoreColor(49)).toBe('text-red-400')
    expect(getScoreColor(25)).toBe('text-red-400')
  })
})

// ─── getScoreRingColor ────────────────────────────────────────────────────────

describe('getScoreRingColor', () => {
  it('returns green hex for scores >= 80', () => {
    expect(getScoreRingColor(80)).toBe('#22c55e')
    expect(getScoreRingColor(100)).toBe('#22c55e')
  })

  it('returns yellow hex for scores 50–79', () => {
    expect(getScoreRingColor(50)).toBe('#eab308')
    expect(getScoreRingColor(79)).toBe('#eab308')
  })

  it('returns red hex for scores below 50', () => {
    expect(getScoreRingColor(0)).toBe('#ef4444')
    expect(getScoreRingColor(49)).toBe('#ef4444')
  })
})

// ─── getSeverityColor ─────────────────────────────────────────────────────────

describe('getSeverityColor', () => {
  it('returns correct color for each severity level', () => {
    expect(getSeverityColor('critical')).toBe('text-red-400')
    expect(getSeverityColor('high')).toBe('text-orange-400')
    expect(getSeverityColor('medium')).toBe('text-yellow-400')
    expect(getSeverityColor('low')).toBe('text-green-400')
  })

  it('returns fallback for unknown severity', () => {
    expect(getSeverityColor('unknown')).toBe('text-haven-sub')
    expect(getSeverityColor('')).toBe('text-haven-sub')
    expect(getSeverityColor(undefined)).toBe('text-haven-sub')
  })
})

// ─── getVerdictStyle ──────────────────────────────────────────────────────────

describe('getVerdictStyle', () => {
  it('returns scam style for scam verdict', () => {
    const style = getVerdictStyle('scam')
    expect(style.label).toBe('SCAM DETECTED')
    expect(style.text).toBe('text-red-400')
  })

  it('returns legitimate style for legitimate verdict', () => {
    const style = getVerdictStyle('legitimate')
    expect(style.label).toBe('LOOKS LEGITIMATE')
    expect(style.text).toBe('text-green-400')
  })

  it('returns unclear style for unclear verdict', () => {
    const style = getVerdictStyle('unclear')
    expect(style.label).toBe('UNCLEAR — USE CAUTION')
    expect(style.text).toBe('text-orange-400')
  })

  it('returns fallback for unknown verdict', () => {
    const style = getVerdictStyle('something_else')
    expect(style.label).toBe('UNKNOWN')
  })
})

// ─── getCategoryLabel ─────────────────────────────────────────────────────────

describe('getCategoryLabel', () => {
  it('returns human-readable label for each type', () => {
    expect(getCategoryLabel('physical_hazard')).toBe('Physical Hazard')
    expect(getCategoryLabel('digital_scam')).toBe('Digital Scam')
    expect(getCategoryLabel('cyber_threat')).toBe('Cyber Threat')
    expect(getCategoryLabel('weather')).toBe('Weather')
    expect(getCategoryLabel('crime_alert')).toBe('Crime Alert')
  })

  it('returns the raw type if unknown', () => {
    expect(getCategoryLabel('some_new_type')).toBe('some_new_type')
  })
})

// ─── truncate ────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('does not truncate strings shorter than limit', () => {
    expect(truncate('Hello', 120)).toBe('Hello')
  })

  it('truncates and appends ellipsis when over limit', () => {
    const long = 'a'.repeat(150)
    const result = truncate(long, 120)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(121)
  })

  it('uses default limit of 120', () => {
    const long = 'b'.repeat(130)
    const result = truncate(long)
    expect(result.endsWith('…')).toBe(true)
  })

  it('handles null and undefined gracefully', () => {
    expect(truncate(null)).toBeFalsy()
    expect(truncate(undefined)).toBeFalsy()
  })
})

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns empty string for null or undefined', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })

  it('returns "Just now" for very recent timestamps', () => {
    const now = new Date().toISOString()
    expect(formatDate(now)).toBe('Just now')
  })

  it('returns days ago for older dates', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()
    expect(formatDate(twoDaysAgo)).toBe('2d ago')
  })
})
