// =============================================================================
// Raindrop.io Adapter — Raindrop REST API v1
// Auth: OAuth 2.0 Bearer token
// Docs: https://developer.raindrop.io/
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

const API_BASE = 'https://api.raindrop.io/rest/v1'

interface RaindropUser {
  user: {
    _id: number
    name: string
    email: string
  }
}

interface RaindropItem {
  _id: number
  link: string
  title: string
  excerpt: string
}

interface RaindropCreateResponse {
  result: boolean
  item:   RaindropItem
}

interface RaindropDeleteResponse {
  result: boolean
}

export class RaindropAdapter extends BaseAdapter {
  readonly platformId = 'raindrop' as const

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const accessToken = this.requireCredential(credentials, 'access_token')

      const res  = await this.fetchWithTimeout(
        `${API_BASE}/user`,
        { headers: this.bearer(accessToken) }
      )
      const data = await this.parseJSON<RaindropUser>(res)

      if (!res.ok) return this.validationFailure(this.classifyError(res.status, data, res.headers))

      const u = data.user
      return {
        valid:          true,
        accountHandle:  u.email,
        accountName:    u.name,
        platformUserId: String(u._id),
      }
    } catch (err) {
      return this.validationFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // publish (= create bookmark)
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const accessToken       = this.requireCredential(credentials, 'access_token')
      const defaultCollection = credentials['default_collection'] ?? '0'
      const collectionId      = parseInt(
        (input.options?.['collection'] as string | undefined) ?? defaultCollection,
        10
      )

      if (!input.url) {
        return this.publishFailure(
          this.adapterError('API_ERROR', 'Raindrop.io requires a URL to bookmark', false)
        )
      }

      const excerpt = this.truncate(input.content, 500)
      const tags    = (input.tags ?? [])
        .slice(0, 10)
        .map((t) => t.replace(/^#+/, '').trim())

      const body: Record<string, unknown> = {
        link:       input.url,
        title:      input.title ?? this.truncate(input.content, 255),
        excerpt,
        tags,
        collection: { $id: isNaN(collectionId) ? 0 : collectionId },
      }

      const res = await this.fetchWithTimeout(
        `${API_BASE}/raindrop`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...this.bearer(accessToken) },
          body:    JSON.stringify(body),
        }
      )
      const data = await this.parseJSON<RaindropCreateResponse>(res)
      const rl   = this.parseRateLimitHeaders(res.headers)

      if (!res.ok || !data.result) {
        return this.publishFailure(this.classifyError(res.status, data, res.headers))
      }

      const item = data.item
      return {
        success:         true,
        platformPostId:  String(item._id),
        platformPostUrl: `https://app.raindrop.io/my/${isNaN(collectionId) ? 0 : collectionId}/${item._id}`,
        ...rl,
      }
    } catch (err) {
      return this.publishFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // deletePost
  // --------------------------------------------------------------------------

  async deletePost(credentials: DecryptedCredentials, platformPostId: string): Promise<DeleteResult> {
    try {
      const accessToken = this.requireCredential(credentials, 'access_token')

      const res = await this.fetchWithTimeout(
        `${API_BASE}/raindrop/${platformPostId}`,
        { method: 'DELETE', headers: this.bearer(accessToken) }
      )

      if (res.status === 404) return { success: true }   // Already deleted
      const data = await this.parseJSON<RaindropDeleteResponse>(res)

      if (!res.ok || !data.result) {
        return this.deleteFailure(this.classifyError(res.status, data, res.headers))
      }
      return { success: true }
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
