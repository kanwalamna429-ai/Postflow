// =============================================================================
// Instapaper Adapter — Instapaper Simple API
// Auth: username (email) + password sent as form fields per request
// Docs: https://www.instapaper.com/api
// Note: Uses the Simple API (no OAuth required). Bookmark IDs are not returned
//       by the simple /api/add endpoint, so deletePost() returns
//       OPERATION_NOT_SUPPORTED with a clear explanation.
//       Upgrade path: implement Full API (v1.1) with OAuth 1.0a for delete support.
// Server-side only.
// =============================================================================

import { BaseAdapter } from './base'
import type {
  DecryptedCredentials,
  PublishInput,
  PublishResult,
  ValidationResult,
  DeleteResult,
} from './types'

const API_BASE = 'https://www.instapaper.com/api'

export class InstapaperAdapter extends BaseAdapter {
  readonly platformId = 'instapaper' as const

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const username = this.requireCredential(credentials, 'username')
      const password = this.requireCredential(credentials, 'password')

      // Instapaper simple auth: POST /api/authenticate
      // Returns 200 on success, 403 on bad credentials, 500 on server error
      const res = await this.fetchWithTimeout(
        `${API_BASE}/authenticate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({ username, password }).toString(),
        }
      )

      if (res.status === 200) {
        return {
          valid:         true,
          accountHandle: username,
          accountName:   username,
        }
      }

      if (res.status === 403) {
        return this.validationFailure(
          this.adapterError('AUTH_INVALID', 'Invalid Instapaper email or password', false, 403)
        )
      }

      return this.validationFailure(this.classifyError(res.status, undefined, res.headers))
    } catch (err) {
      return this.validationFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // publish (= add URL to read-later list)
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const username = this.requireCredential(credentials, 'username')
      const password = this.requireCredential(credentials, 'password')

      if (!input.url) {
        return this.publishFailure(
          this.adapterError('API_ERROR', 'Instapaper requires a URL to save', false)
        )
      }

      const params: Record<string, string> = {
        username,
        password,
        url:   input.url,
      }
      if (input.title) {
        params['title'] = this.truncate(input.title, 255)
      }
      if (input.content) {
        // 'selection' is used as a description / excerpt by Instapaper
        params['selection'] = this.truncate(input.content, 500)
      }

      const res = await this.fetchWithTimeout(
        `${API_BASE}/add`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams(params).toString(),
        }
      )

      if (res.status === 201) {
        // Simple API does not return the bookmark ID in the response body
        // Store a sentinel ID so we can surface this limitation clearly
        const location = res.headers.get('Location') ?? ''
        return {
          success:         true,
          platformPostId:  `instapaper:${encodeURIComponent(input.url)}`,
          platformPostUrl: location || `https://www.instapaper.com/read/${encodeURIComponent(input.url)}`,
        }
      }

      if (res.status === 400) {
        return this.publishFailure(
          this.adapterError('API_ERROR', 'Invalid or malformed URL', false, 400)
        )
      }
      if (res.status === 403) {
        return this.publishFailure(
          this.adapterError('AUTH_INVALID', 'Instapaper authentication failed', false, 403)
        )
      }

      return this.publishFailure(this.classifyError(res.status, undefined, res.headers))
    } catch (err) {
      return this.publishFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // deletePost — not available in the Instapaper Simple API
  // --------------------------------------------------------------------------

  async deletePost(_credentials: DecryptedCredentials, _platformPostId: string): Promise<DeleteResult> {
    // The Instapaper Simple API (/api) does not expose a delete/archive endpoint.
    // Full API (v1.1) supports deletion but requires OAuth 1.0a consumer credentials
    // which are only available to approved partners. Upgrade path: implement
    // xAuth token exchange + HMAC-SHA1 signing against /api/1.1/bookmarks/delete.
    return this.notSupported(
      'deletePost — Instapaper Simple API does not support deletion. ' +
      'Use the Full API (OAuth 1.0a) for archive/delete support.'
    )
  }
}
