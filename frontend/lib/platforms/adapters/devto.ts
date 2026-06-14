// =============================================================================
// DEV.to Adapter — Forem API v1
// Auth: API key (header: api-key)
// Docs: https://developers.forem.com/api
// Note: DEV.to does not support hard-delete via the public API.
//       deletePost() unpublishes the article instead.
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

const API_BASE = 'https://dev.to/api'

interface DevToUser {
  id: number
  username: string
  name: string
  profile_image: string
}

interface DevToArticle {
  id: number
  url: string
  slug: string
  title: string
  published: boolean
}

export class DevToAdapter extends BaseAdapter {
  readonly platformId = 'devto' as const

  private apiHeaders(apiKey: string): Record<string, string> {
    return { 'api-key': apiKey, 'Content-Type': 'application/json' }
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const apiKey = this.requireCredential(credentials, 'api_key')

      const res  = await this.fetchWithTimeout(
        `${API_BASE}/users/me`,
        { headers: this.apiHeaders(apiKey) }
      )
      const data = await this.parseJSON<DevToUser>(res)

      if (!res.ok) return this.validationFailure(this.classifyError(res.status, data, res.headers))

      return {
        valid:          true,
        accountHandle:  data.username,
        accountName:    data.name,
        platformUserId: String(data.id),
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
      const apiKey = this.requireCredential(credentials, 'api_key')

      // DEV.to uses Markdown body. Limit: ~65k chars but keep well under.
      const bodyMarkdown = this.buildBody(input)
      const title        = input.title ?? this.truncate(input.content, 128)
      const tags         = (input.tags ?? [])
        .slice(0, 4)
        .map((t) => t.replace(/^#+/, '').replace(/\s+/g, '').toLowerCase())

      const res = await this.fetchWithTimeout(
        `${API_BASE}/articles`,
        {
          method:  'POST',
          headers: this.apiHeaders(apiKey),
          body: JSON.stringify({
            article: {
              title,
              body_markdown: bodyMarkdown,
              published:     true,
              tags,
              ...(input.url ? { canonical_url: input.url } : {}),
            },
          }),
        }
      )
      const data = await this.parseJSON<DevToArticle>(res)
      const rl   = this.parseRateLimitHeaders(res.headers)

      if (!res.ok) return this.publishFailure(this.classifyError(res.status, data, res.headers))

      return {
        success:         true,
        platformPostId:  String(data.id),
        platformPostUrl: data.url,
        ...rl,
      }
    } catch (err) {
      return this.publishFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // deletePost — DEV.to doesn't allow hard-delete; unpublish instead
  // --------------------------------------------------------------------------

  async deletePost(credentials: DecryptedCredentials, platformPostId: string): Promise<DeleteResult> {
    try {
      const apiKey = this.requireCredential(credentials, 'api_key')

      const res = await this.fetchWithTimeout(
        `${API_BASE}/articles/${platformPostId}`,
        {
          method:  'PUT',
          headers: this.apiHeaders(apiKey),
          body:    JSON.stringify({ article: { published: false } }),
        }
      )

      if (res.status === 404) return { success: true }   // already gone
      const data = await this.parseJSON<DevToArticle>(res)

      if (!res.ok) return this.deleteFailure(this.classifyError(res.status, data, res.headers))
      return { success: true }
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private buildBody(input: PublishInput): string {
    let body = input.content
    if (input.url) body += `\n\n---\n*Originally published at [${input.url}](${input.url})*`
    if (input.tags?.length) {
      body += '\n\n' + this.buildTagString(input.tags, '#', 0, ' ')
    }
    return this.truncate(body, 60_000)
  }
}
