// =============================================================================
// Diigo Adapter — Diigo API v2
// Auth: HTTP Basic auth (username : api_key) + api_key in request body
// Docs: https://www.diigo.com/api_dev/docs
// Note: Diigo's API does not expose a public bookmark-delete endpoint.
//       deletePost() returns OPERATION_NOT_SUPPORTED.
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

const API_BASE = 'https://secure.diigo.com/api/v2'

interface DiigoBookmark {
  title: string
  url: string
  user: string
  desc: string
  tags: string
  shared: string
  readlater: string
}

export class DiigoAdapter extends BaseAdapter {
  readonly platformId = 'diigo' as const

  /** Diigo uses HTTP Basic auth with username:api_key */
  private basicAuth(username: string, apiKey: string): Record<string, string> {
    const encoded = btoa(`${username}:${apiKey}`)
    return { Authorization: `Basic ${encoded}` }
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const username = this.requireCredential(credentials, 'username')
      const apiKey   = this.requireCredential(credentials, 'api_key')

      const url = `${API_BASE}/bookmarks?${new URLSearchParams({
        key:   apiKey,
        user:  username,
        count: '1',
        rows:  '1',
      })}`

      const res  = await this.fetchWithTimeout(url, {
        headers: this.basicAuth(username, apiKey),
      })
      const data = await this.parseJSON<DiigoBookmark[]>(res)

      // Diigo returns 403 for bad credentials, 200 (even empty array) for valid
      if (res.status === 403) {
        return this.validationFailure(
          this.adapterError('AUTH_INVALID', 'Invalid Diigo username or API key', false, 403)
        )
      }
      if (!res.ok) return this.validationFailure(this.classifyError(res.status, data, res.headers))

      return {
        valid:         true,
        accountHandle: username,
        accountName:   username,
      }
    } catch (err) {
      return this.validationFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // publish (= save bookmark)
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const username = this.requireCredential(credentials, 'username')
      const apiKey   = this.requireCredential(credentials, 'api_key')

      if (!input.url) {
        return this.publishFailure(
          this.adapterError('API_ERROR', 'Diigo requires a URL to bookmark', false)
        )
      }

      const title = input.title ?? this.truncate(input.content, 255)
      const desc  = this.truncate(input.content, 500)
      const tags  = (input.tags ?? [])
        .slice(0, 10)
        .map((t) => t.replace(/^#+/, '').trim())
        .join(',')

      // Diigo accepts form params with api_key in body for POST
      const params: Record<string, string> = {
        key:       apiKey,
        user:      username,
        url:       input.url,
        title:     title,
        desc:      desc,
        shared:    'yes',
        readlater: 'no',
      }
      if (tags) params['tags'] = tags

      const res = await this.fetchWithTimeout(
        `${API_BASE}/bookmarks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...this.basicAuth(username, apiKey),
          },
          body: new URLSearchParams(params).toString(),
        }
      )

      // Diigo returns 200 with created bookmark on success
      if (!res.ok) {
        const data = await this.parseJSON(res)
        return this.publishFailure(this.classifyError(res.status, data, res.headers))
      }

      // Response body is the saved bookmark object or an array
      const data = await this.parseJSON<DiigoBookmark | DiigoBookmark[]>(res)
      const bookmark = Array.isArray(data) ? data[0] : data

      return {
        success:         true,
        platformPostId:  encodeURIComponent(input.url),   // Use URL as surrogate ID
        platformPostUrl: `https://www.diigo.com/user/${username}`,
        ...(bookmark && {}),
      }
    } catch (err) {
      return this.publishFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // deletePost — not available in the public Diigo API
  // --------------------------------------------------------------------------

  async deletePost(_credentials: DecryptedCredentials, _platformPostId: string): Promise<DeleteResult> {
    return this.notSupported('deletePost')
  }
}
