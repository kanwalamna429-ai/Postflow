// =============================================================================
// Pixelfed Adapter — Mastodon-compatible API v1
// Auth: OAuth 2.0 Bearer token (instance-specific)
// Docs: https://docs.pixelfed.org/technical-documentation/api/
// Note: Pixelfed implements the Mastodon API surface, so the adapter mirrors
//       the Mastodon adapter with Pixelfed-specific content rules applied.
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

interface PixelfedAccount {
  id: string
  username: string
  display_name: string
  url: string
}

interface PixelfedStatus {
  id: string
  url: string
}

export class PixelfedAdapter extends BaseAdapter {
  readonly platformId = 'pixelfed' as const

  private apiBase(instanceUrl: string): string {
    return instanceUrl.replace(/\/$/, '') + '/api/v1'
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const instanceUrl = this.requireCredential(credentials, 'instance_url')
      const accessToken = this.requireCredential(credentials, 'access_token')

      const res  = await this.fetchWithTimeout(
        `${this.apiBase(instanceUrl)}/accounts/verify_credentials`,
        { headers: this.bearer(accessToken) }
      )
      const data = await this.parseJSON<PixelfedAccount>(res)

      if (!res.ok) return this.validationFailure(this.classifyError(res.status, data, res.headers))

      return {
        valid:          true,
        accountHandle:  `@${data.username}@${new URL(instanceUrl).hostname}`,
        accountName:    data.display_name || data.username,
        platformUserId: data.id,
      }
    } catch (err) {
      return this.validationFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // publish
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const instanceUrl = this.requireCredential(credentials, 'instance_url')
      const accessToken = this.requireCredential(credentials, 'access_token')

      // Pixelfed caption limit: 2200 chars (Instagram-like)
      const tagStr = input.tags?.length
        ? '\n\n' + this.buildTagString(input.tags, '#', 10)
        : ''
      const caption = this.truncate(input.content, 2200 - tagStr.length) + tagStr

      // Pixelfed is image-first — warn if no media but don't block text-only posts
      const body: Record<string, unknown> = {
        status:     caption,
        visibility: 'public',
      }

      const res = await this.fetchWithTimeout(
        `${this.apiBase(instanceUrl)}/statuses`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...this.bearer(accessToken) },
          body:    JSON.stringify(body),
        }
      )
      const data = await this.parseJSON<PixelfedStatus>(res)
      const rl   = this.parseRateLimitHeaders(res.headers)

      if (!res.ok) return this.publishFailure(this.classifyError(res.status, data, res.headers))

      return {
        success:         true,
        platformPostId:  data.id,
        platformPostUrl: data.url,
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
      const instanceUrl = this.requireCredential(credentials, 'instance_url')
      const accessToken = this.requireCredential(credentials, 'access_token')

      const res = await this.fetchWithTimeout(
        `${this.apiBase(instanceUrl)}/statuses/${platformPostId}`,
        { method: 'DELETE', headers: this.bearer(accessToken) }
      )

      if (res.status === 200 || res.status === 404) return { success: true }
      const data = await this.parseJSON(res)
      return this.deleteFailure(this.classifyError(res.status, data, res.headers))
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
