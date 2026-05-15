/**
 * ROWANG.ID — AI Model Routing
 * Haiku  → extraction (cheap, fast)
 * Sonnet → interview conductor
 * Sonnet → clone chat (Opus removed — invalid model string was causing 500 errors)
 */
export const MODELS = {
  EXTRACTION: 'claude-haiku-4-5-20251001',
  INTERVIEW:  'claude-sonnet-4-6',
  CLONE:      'claude-sonnet-4-6',  // Using Sonnet — reliable, fast, good quality
} as const

export const MAX_TOKENS = {
  EXTRACTION: 600,
  INTERVIEW:  512,
  CLONE:      1024,
} as const
