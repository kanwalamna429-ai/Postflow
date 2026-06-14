// =============================================================================
// Environment Variable Validation — Phase 8
// Call validateEnv() at application startup to catch missing config early.
// =============================================================================

export interface EnvValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/** All required environment variables for production */
const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

/** Optional but strongly recommended for full functionality */
const RECOMMENDED_VARS = [
  'GEMINI_API_KEY',
  'POSTFLOW_ENCRYPTION_KEY',
  'PROCESS_POSTS_SECRET',
] as const

/**
 * Validate all required and recommended environment variables.
 * Safe to call in both server and client contexts (only checks NEXT_PUBLIC_ on client).
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  for (const key of RECOMMENDED_VARS) {
    if (!process.env[key]) {
      warnings.push(`${key} is not set — related functionality will be disabled`)
    }
  }

  // Validate POSTFLOW_ENCRYPTION_KEY length (must be 64 hex chars = 32 bytes)
  const encKey = process.env.POSTFLOW_ENCRYPTION_KEY
  if (encKey && encKey.length !== 64) {
    warnings.push(`POSTFLOW_ENCRYPTION_KEY must be exactly 64 hex characters (got ${encKey.length})`)
  }
  if (encKey && !/^[0-9a-fA-F]+$/.test(encKey)) {
    warnings.push('POSTFLOW_ENCRYPTION_KEY must contain only hex characters (0-9, a-f)')
  }

  // Validate Supabase URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL should start with https://')
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Server-only: throw if required vars are missing. Call in route handlers.
 * Provides a clear error message instead of a cryptic crash.
 */
export function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Please add it to your .env.local file or deployment environment.`
    )
  }
  return value
}

/**
 * Get a typed snapshot of the current environment config.
 * Never returns secret values — only boolean presence.
 */
export function getEnvStatus(): Record<string, boolean> {
  return {
    supabaseUrl:        Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey:    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    geminiApiKey:       Boolean(process.env.GEMINI_API_KEY),
    encryptionKey:      Boolean(process.env.POSTFLOW_ENCRYPTION_KEY),
    processPostsSecret: Boolean(process.env.PROCESS_POSTS_SECRET),
  }
}
