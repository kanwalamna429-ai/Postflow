// =============================================================================
// Mastodon Adapter — Mastodon API v1
// Auth: OAuth 2.0 Bearer token (instance-specific)
// Docs: https://docs.joinmastodon.org/client/intro/
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

interface MastodonAccount {
  id: string
  username: string
  display_name: string
  url: string
}

interface MastodonStatus {
  id: string
  url: string
  visibility: string
}

export class MastodonAdapter extends BaseAdapter {
  readonly platformId = 'mastodon' as const

  private apiBase(instanceUrl: string): string {
    return instanceUrl.replace(/\/$/, '') + '/api/v1'
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const instanceUrl  = this.requireCredential(credentials, 'instance_url')
      const accessToken  = this.requireCredential(credentials, 'access_token')

      const res = await this.fetchWithTimeout(
        `${this.apiBase(instanceUrl)}/accounts/verify_credentials`,
        { headers: this.bearer(accessToken) }
      )
      const data = await this.parseJSON<MastodonAccount>(res)

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

      // 500-char limit; append hashtags on new line
      const tagStr  = input.tags?.length ? '\n\n' + this.buildTagString(input.tags, '#', 6) : ''
      const status  = this.truncate(input.content, 500 - tagStr.length) + tagStr

      const res = await this.fetchWithTimeout(
        `${this.apiBase(instanceUrl)}/statuses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.bearer(accessToken),
          },
          body: JSON.stringify({ status, visibility: 'public', language: 'en' }),
        }
      )
      const data = await this.parseJSON<MastodonStatus>(res)
      const rl   = this.parseRateLimitHeaders(res.headers)

      if (!res.ok) return this.publishFailure(this.classifyError(res.status, data, res.headers))

      return {
        success:          true,
        platformPostId:   data.id,
        platformPostUrl:  data.url,
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

      // 200 = deleted status returned; 404 = already gone (treat as success)
      if (res.status === 200 || res.status === 404) return { success: true }
      const data = await this.parseJSON(res)
      return this.deleteFailure(this.classifyError(res.status, data, res.headers))
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
