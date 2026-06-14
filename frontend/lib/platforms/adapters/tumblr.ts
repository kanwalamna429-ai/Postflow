// =============================================================================
// Tumblr Adapter — Tumblr API v2 (Neue Post Format)
// Auth: OAuth 2.0 Bearer token
// Docs: https://www.tumblr.com/docs/en/api/v2
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

const API_BASE = 'https://api.tumblr.com/v2'

interface TumblrUserInfo {
  response: {
    user: {
      name: string
      likes: number
      following: number
      blogs: Array<{ name: string; url: string; primary: boolean }>
    }
  }
}

interface TumblrCreatePostResponse {
  meta: { status: number; msg: string }
  response: { id: string; id_string: string; state: string }
}

interface TumblrDeleteResponse {
  meta: { status: number; msg: string }
}

export class TumblrAdapter extends BaseAdapter {
  readonly platformId = 'tumblr' as const

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const accessToken     = this.requireCredential(credentials, 'access_token')
      const blogIdentifier  = this.requireCredential(credentials, 'blog_identifier')

      const res  = await this.fetchWithTimeout(
        `${API_BASE}/user/info`,
        { headers: this.bearer(accessToken) }
      )
      const data = await this.parseJSON<TumblrUserInfo>(res)

      if (!res.ok) return this.validationFailure(this.classifyError(res.status, data, res.headers))

      const user = data.response?.user
      return {
        valid:         true,
        accountHandle: blogIdentifier,
        accountName:   user?.name ?? blogIdentifier,
        scopes:        ['write', 'read'],
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
      const accessToken    = this.requireCredential(credentials, 'access_token')
      const blogIdentifier = this.requireCredential(credentials, 'blog_identifier')

      // Build NPF (Neue Post Format) content block
      const text = this.truncate(input.content, 4096)

      // Tumblr tags: plain strings, no # prefix, up to 30 per post
      const tags: string[] = (input.tags ?? [])
        .slice(0, 30)
        .map((t) => t.replace(/^#+/, '').trim())

      const body: Record<string, unknown> = {
        content: [{ type: 'text', text }],
        tags,
        state: 'published',
      }

      // If a URL is provided, append a link block
      if (input.url) {
        ;(body.content as unknown[]).push({
          type:        'link',
          url:         input.url,
          title:       input.title ?? undefined,
          description: undefined,
        })
      }

      const res = await this.fetchWithTimeout(
        `${API_BASE}/blog/${encodeURIComponent(blogIdentifier)}/posts`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...this.bearer(accessToken) },
          body:    JSON.stringify(body),
        }
      )
      const data = await this.parseJSON<TumblrCreatePostResponse>(res)
      const rl   = this.parseRateLimitHeaders(res.headers)

      if (!res.ok) return this.publishFailure(this.classifyError(res.status, data, res.headers))

      const postId  = data.response?.id_string ?? data.response?.id
      const blogUrl = blogIdentifier.includes('.')
        ? `https://${blogIdentifier}`
        : `https://${blogIdentifier}.tumblr.com`

      return {
        success:         true,
        platformPostId:  postId,
        platformPostUrl: `${blogUrl}/post/${postId}`,
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
      const accessToken    = this.requireCredential(credentials, 'access_token')
      const blogIdentifier = this.requireCredential(credentials, 'blog_identifier')

      const res = await this.fetchWithTimeout(
        `${API_BASE}/blog/${encodeURIComponent(blogIdentifier)}/posts/${platformPostId}`,
        { method: 'DELETE', headers: this.bearer(accessToken) }
      )
      const data = await this.parseJSON<TumblrDeleteResponse>(res)

      if (res.ok || res.status === 404) return { success: true }
      return this.deleteFailure(this.classifyError(res.status, data, res.headers))
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
