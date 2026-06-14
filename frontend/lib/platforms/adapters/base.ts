// =============================================================================
// BaseAdapter — Abstract base class for all platform adapters.
// Provides shared fetch, error classification, content utilities.
// All methods are protected — only subclasses and their output is public.
// =============================================================================

import type { AllPlatformId } from '../types'
import type {
  PlatformAdapter,
  DecryptedCredentials,
  PublishInput,
  PublishResult,
  ValidationResult,
  DeleteResult,
  AdapterError,
  AdapterErrorCode,
} from './types'

export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platformId: AllPlatformId

  abstract validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult>
  abstract publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult>
  abstract deletePost(credentials: DecryptedCredentials, platformPostId: string): Promise<DeleteResult>

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  /**
   * fetch() with AbortController timeout.
   * @param timeoutMs Default 15 seconds.
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 15_000
  ): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw this.adapterError('NETWORK_TIMEOUT', `Request timed out after ${timeoutMs}ms`, false)
      }
      throw this.adapterError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network error', true)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * POST JSON helper — sets Content-Type automatically.
   */
  protected async postJSON<T = unknown>(
    url: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; data: T; headers: Headers }> {
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    const data = await this.parseJSON<T>(res)
    return { status: res.status, data, headers: res.headers }
  }

  /**
   * POST application/x-www-form-urlencoded helper.
   */
  protected async postForm<T = unknown>(
    url: string,
    fields: Record<string, string>,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; data: T; headers: Headers }> {
    const body = new URLSearchParams(fields).toString()
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body,
    })
    const data = await this.parseJSON<T>(res)
    return { status: res.status, data, headers: res.headers }
  }

  /** Parse response body as JSON, returning empty object on failure. */
  protected async parseJSON<T = unknown>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T
    } catch {
      return {} as T
    }
  }

  /** Build an Authorization: Bearer header object. */
  protected bearer(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` }
  }

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  /**
   * Classify an HTTP status code into a structured AdapterError.
   */
  protected classifyError(status: number, body?: unknown, httpHeaders?: Headers): AdapterError {
    const msg = this.extractErrorMessage(body)

    // Parse Retry-After if rate limited
    const retryAfter = httpHeaders?.get('Retry-After')

    switch (true) {
      case status === 400:
        return this.adapterError('API_ERROR', `Bad request: ${msg}`, false, status, body)
      case status === 401:
        return this.adapterError('AUTH_EXPIRED', 'Access token expired — reconnect this platform', false, status, body)
      case status === 403:
        return this.adapterError('PERMISSION_DENIED', `Insufficient permissions: ${msg}`, false, status, body)
      case status === 404:
        return this.adapterError('NOT_FOUND', 'Resource not found on platform', false, status, body)
      case status === 422:
        return this.adapterError('CONTENT_REJECTED', `Content rejected by platform: ${msg}`, false, status, body)
      case status === 429:
        return this.adapterError(
          'RATE_LIMITED',
          retryAfter ? `Rate limited — retry after ${retryAfter}s` : 'Rate limited — retry after cooldown',
          true, status, body
        )
      case status >= 500:
        return this.adapterError('API_ERROR', `Platform server error (${status}): ${msg}`, true, status, body)
      default:
        return this.adapterError('API_ERROR', msg, false, status, body)
    }
  }

  protected adapterError(
    code: AdapterErrorCode,
    message: string,
    retryable: boolean,
    httpStatus?: number,
    detail?: unknown
  ): AdapterError {
    return { code, message, retryable, httpStatus, detail }
  }

  protected networkError(err: unknown): AdapterError {
    // Already a plain AdapterError object (thrown by requireCredential / adapterError())
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      'message' in err &&
      typeof (err as Record<string, unknown>).message === 'string'
    ) {
      return err as AdapterError
    }
    if (err instanceof Error) {
      return this.adapterError('NETWORK_ERROR', err.message, true)
    }
    return this.adapterError('NETWORK_ERROR', 'Unknown network error', true)
  }

  protected extractErrorMessage(body?: unknown): string {
    if (!body) return 'No error detail'
    if (typeof body === 'string') return body.slice(0, 200)
    if (typeof body === 'object') {
      const b = body as Record<string, unknown>
      const msg =
        b['error_description'] ??
        b['error_message'] ??
        b['message'] ??
        b['error'] ??
        b['detail'] ??
        b['msg']
      if (typeof msg === 'string') return msg.slice(0, 200)
      if (typeof msg === 'object' && msg !== null) return JSON.stringify(msg).slice(0, 200)
      return JSON.stringify(body).slice(0, 200)
    }
    return String(body).slice(0, 200)
  }

  /** Build error result for validateConnection */
  protected validationFailure(error: AdapterError): ValidationResult {
    return { valid: false, error }
  }

  /** Build error result for publish */
  protected publishFailure(error: AdapterError): PublishResult {
    return { success: false, error }
  }

  /** Build error result for deletePost */
  protected deleteFailure(error: AdapterError): DeleteResult {
    return { success: false, error }
  }

  /** Result for platforms that don't support post deletion */
  protected notSupported(operation: string): DeleteResult {
    return {
      success: false,
      error: this.adapterError(
        'OPERATION_NOT_SUPPORTED',
        `${this.platformId}: ${operation} is not available in the platform API`,
        false
      ),
    }
  }

  // ---------------------------------------------------------------------------
  // Content utilities
  // ---------------------------------------------------------------------------

  /**
   * Truncate content to a character limit, appending '…' if cut.
   * If limit <= 0, returns content unchanged.
   */
  protected truncate(content: string, limit: number): string {
    if (limit <= 0 || content.length <= limit) return content
    return content.slice(0, limit - 1).trimEnd() + '…'
  }

  /**
   * Convert a tags array to a string with the given prefix.
   * Strips existing # prefixes and spaces, then re-applies prefix.
   * @param maxCount 0 = no limit
   */
  protected buildTagString(
    tags: string[],
    prefix: '#' | '' = '#',
    maxCount = 0,
    separator = ' '
  ): string {
    const capped = maxCount > 0 ? tags.slice(0, maxCount) : tags
    return capped
      .map((t) => `${prefix}${t.replace(/^#+/, '').replace(/\s+/g, '_')}`)
      .join(separator)
  }

  /**
   * Parse rate limit headers from common header names.
   */
  protected parseRateLimitHeaders(headers: Headers): {
    rateLimitRemaining?: number
    rateLimitResetAt?: Date
  } {
    const remaining = headers.get('X-RateLimit-Remaining') ?? headers.get('x-ratelimit-remaining')
    const reset     = headers.get('X-RateLimit-Reset')     ?? headers.get('x-ratelimit-reset')
    return {
      rateLimitRemaining: remaining !== null ? parseInt(remaining, 10) : undefined,
      rateLimitResetAt:   reset     !== null ? new Date(parseInt(reset, 10) * 1000) : undefined,
    }
  }

  /**
   * Require a credential key — throws a structured auth error if missing.
   */
  protected requireCredential(credentials: DecryptedCredentials, key: string): string {
    const value = credentials[key]
    if (!value) {
      throw this.adapterError(
        'AUTH_INVALID',
        `Missing required credential: ${key}`,
        false
      )
    }
    return value
  }
}
