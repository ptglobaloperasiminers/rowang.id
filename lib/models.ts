/**
 * ROWANG.ID — AI Model Routing (Mixed Strategy)
 *
 * Haiku  → background extraction, voice patterns, WhatsApp analysis
 * Sonnet → AI interview conductor (asks, follows up, goes deep)
 * Opus   → clone chat only (premium quality, where Julius is judged)
 *
 * Cost vs Opus-only: ~75% cheaper
 */

export const MODELS = {
  EXTRACTION: 'claude-haiku-4-5-20251001',   // $0.80/$4 per 1M
  INTERVIEW:  'claude-sonnet-4-6',            // $3/$15 per 1M
  CLONE:      'claude-opus-4-5-20251101',     // $15/$75 per 1M
} as const

export const MAX_TOKENS = {
  EXTRACTION: 600,
  INTERVIEW:  512,
  CLONE:      1024,
} as const
