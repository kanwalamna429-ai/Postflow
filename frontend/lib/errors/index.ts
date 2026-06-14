// =============================================================================
// Centralized Error Handling — Phase 8
// Typed error classes + standardized API response helpers.
// Never expose stack traces or internal details to clients.
// =============================================================================

import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED:         'UNAUTHORIZED',
  FORBIDDEN:            'FORBIDDEN',
  SESSION_EXPIRED:      'SESSION_EXPIRED',

  // Input
  VALIDATION_ERROR:     'VALIDATION_ERROR',
  INVALID_URL:          'INVALID_URL',
  MISSING_FIELD:        'MISSING_FIELD',

  // Rate limiting
  RATE_LIMITED:         'RATE_LIMITED',

  // External services
  PLATFORM_ERROR:       'PLATFORM_ERROR',
  AI_ERROR:             'AI_ERROR',
  DB_ERROR:             'DB_ERROR',

  // Publishing
  NO_CONNECTION:        'NO_CONNECTION',
  AUTH_INVALID:         'AUTH_INVALID',
  PUBLISH_FAILED:       'PUBLISH_FAILED',
  DUPLICATE_PUBLISH:    'DUPLICATE_PUBLISH',

  // Generic
  NOT_FOUND:            'NOT_FOUND',
  INTERNAL:             'INTERNAL',
  SERVICE_UNAVAILABLE:  'SERVICE_UNAVAILABLE',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

// ---------------------------------------------------------------------------
// AppError class
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401)
  }

  static forbidden(message = 'Access denied'): AppError {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403)
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400, false, details)
  }

  static notFound(resource: string): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, `${resource} not found`, 404)
  }

  static rateLimited(retryAfterSeconds?: number): AppError {
    return new AppError(
      ERROR_CODES.RATE_LIMITED,
      'Too many requests. Please slow down.',
      429,
      true,
      retryAfterSeconds ? { retryAfterSeconds } : undefined,
    )
  }

  static internal(message = 'An unexpected error occurred'): AppError {
    return new AppError(ERROR_CODES.INTERNAL, message, 500, true)
  }
}

// ---------------------------------------------------------------------------
// API response helpers
// ---------------------------------------------------------------------------

/** Standard error response shape — never includes stack traces */
export interface ApiErrorResponse {
  error: string
  code: ErrorCode
  details?: Record<string, unknown>
}

/** Return a typed Next.js error response */
export function errorResponse(err: unknown): NextResponse<ApiErrorResponse> {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.statusCode }
    )
  }

  // Unknown error — log internally, return generic message
  const message = err instanceof Error ? err.message : String(err)
  console.error('[API error]', message)

  return NextResponse.json(
    { error: 'An unexpected error occurred', code: ERROR_CODES.INTERNAL },
    { status: 500 }
  )
}

/** Type guard */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

// ---------------------------------------------------------------------------
// User-facing messages (sanitized — no internal details)
// ---------------------------------------------------------------------------

export function getUserMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    UNAUTHORIZED:        'Please sign in to continue.',
    FORBIDDEN:           'You don\'t have permission to do that.',
    SESSION_EXPIRED:     'Your session has expired. Please sign in again.',
    VALIDATION_ERROR:    'Please check your input and try again.',
    INVALID_URL:         'That URL doesn\'t look valid. Please check and try again.',
    MISSING_FIELD:       'Please fill in all required fields.',
    RATE_LIMITED:        'You\'re doing that too quickly. Please wait a moment.',
    PLATFORM_ERROR:      'The platform returned an error. Please try again.',
    AI_ERROR:            'Content generation failed. Please try again.',
    DB_ERROR:            'A database error occurred. Please try again.',
    NO_CONNECTION:       'No connected account found for this platform.',
    AUTH_INVALID:        'Platform credentials are invalid. Please reconnect.',
    PUBLISH_FAILED:      'Publishing failed. Please check your connection and try again.',
    DUPLICATE_PUBLISH:   'This post has already been published.',
    NOT_FOUND:           'The requested resource was not found.',
    INTERNAL:            'Something went wrong. Please try again.',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again shortly.',
  }
  return messages[code] ?? 'An unexpected error occurred.'
}
