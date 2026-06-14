// =============================================================================
// Reddit Adapter — Reddit OAuth API
// Auth: OAuth 2.0 Bearer token
// Docs: https://www.reddit.com/dev/api/
// Note: Requires User-Agent header per Reddit API rules.
//       Defaults to self (text) posts unless a URL is provided.
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

const API_BASE   = 'https://oauth.reddit.com'
const USER_AGENT = 'PostFlow:v1.0 (server-side automation)'

interface RedditMe {
  id: string
  name: string
  icon_img?: string
}

interface RedditSubmitResponse {
  json: {
    errors: Array<[string, string, string]>
    data?: {
      url:  string
      name: string    // Fullname: t3_{id}
      id:   string
    }
  }
}

interface RedditApiResponse {
  json?: { errors?: Array<[string, string, string]> }
}

export class RedditAdapter extends BaseAdapter {
  readonly platformId = 'reddit' as const

  private headers(accessToken: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent':    USER_AGENT,
    }
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const accessToken = this.requireCredential(credentials, 'access_token')

      const res  = await this.fetchWithTimeout(
        `${API_BASE}/api/v1/me`,
        { headers: this.headers(accessToken) }
      )
      const data = await this.parseJSON<RedditMe>(res)

      if (!res.ok) return this.validationFailure(this.classifyError(res.status, data, res.headers))

      return {
        valid:          true,
        accountHandle:  `u/${data.name}`,
        accountName:    data.name,
        platformUserId: `t2_${data.id}`,
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
      const accessToken     = this.requireCredential(credentials, 'access_token')
      const defaultSubreddit = credentials['default_subreddit'] ?? 'test'
      const subreddit       = (input.options?.['subreddit'] as string | undefined)
        ?? defaultSubreddit.replace(/^r\//, '')

      // Reddit posts: 'link' when URL provided, 'self' for text
      const isLink = Boolean(input.url)
      const kind   = isLink ? 'link' : 'self'

      const title = input.title
        ?? this.truncate(input.content, 300)

      const body: Record<string, string> = {
        kind,
        sr:        subreddit,
        title,
        resubmit:  'true',
        nsfw:      'false',
        spoiler:   'false',
        api_type:  'json',
      }

      if (isLink && input.url) {
        body['url'] = input.url
      } else {
        // Text post: truncate to 40,000 chars (Reddit selfpost limit)
        body['text'] = this.truncate(input.content, 40_000)
      }

      // Reddit submit uses form encoding, not JSON
      const res = await this.fetchWithTimeout(
        `${API_BASE}/api/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...this.headers(accessToken),
          },
          body: new URLSearchParams(body).toString(),
        }
      )
      const data = await this.parseJSON<RedditSubmitResponse>(res)
      const rl   = this.parseRateLimitHeaders(res.headers)

      if (!res.ok) return this.publishFailure(this.classifyError(res.status, data, res.headers))

      const { errors, data: postData } = data.json
      if (errors && errors.length > 0) {
        return this.publishFailure(
          this.adapterError('API_ERROR', `Reddit error: ${errors[0][1]}`, false, res.status)
        )
      }

      return {
        success:         true,
        platformPostId:  postData?.name ?? '',   // t3_{id} fullname
        platformPostUrl: postData?.url ?? '',
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

      // platformPostId must be a fullname: t3_{id}
      const fullname = platformPostId.startsWith('t3_') ? platformPostId : `t3_${platformPostId}`

      const res = await this.fetchWithTimeout(
        `${API_BASE}/api/del`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...this.headers(accessToken),
          },
          body: new URLSearchParams({ id: fullname }).toString(),
        }
      )
      const data = await this.parseJSON<RedditApiResponse>(res)

      if (!res.ok) return this.deleteFailure(this.classifyError(res.status, data, res.headers))

      const errors = data.json?.errors
      if (errors && errors.length > 0) {
        return this.deleteFailure(
          this.adapterError('API_ERROR', `Reddit error: ${errors[0][1]}`, false, res.status)
        )
      }
      return { success: true }
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
