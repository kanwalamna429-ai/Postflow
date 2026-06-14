// =============================================================================
// Pocket Adapter — Pocket API v3
// Auth: consumer_key + access_token (sent in every request body)
// Docs: https://getpocket.com/developer/docs/overview
// Note: Pocket uses non-standard HTTP — always returns 200, errors via headers.
//       X-Error-Code and X-Error headers indicate failures.
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

const API_BASE = 'https://getpocket.com/v3'

const POCKET_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Accept':     'application/json',
}

interface PocketGetResponse {
  status:  number
  list:    Record<string, { item_id: string; resolved_url: string; resolved_title: string }>
  error?:  string
}

interface PocketAddResponse {
  item: {
    item_id:      string
    resolved_id: string
    given_url:   string
    resolved_url: string
    title:        string
  }
  status: number
}

interface PocketSendResponse {
  action_results: boolean[]
  status:         number
}

export class PocketAdapter extends BaseAdapter {
  readonly platformId = 'pocket' as const

  /** Check Pocket's non-standard error headers. */
  private checkPocketError(headers: Headers): string | null {
    const errorCode = headers.get('X-Error-Code')
    const error     = headers.get('X-Error')
    if (errorCode || error) return error ?? `Error ${errorCode}`
    return null
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const accessToken  = this.requireCredential(credentials, 'access_token')
      const consumerKey  = this.requireCredential(credentials, 'consumer_key')

      const res = await this.fetchWithTimeout(
        `${API_BASE}/get`,
        {
          method:  'POST',
          headers: POCKET_HEADERS,
          body: JSON.stringify({
            consumer_key: consumerKey,
            access_token: accessToken,
            count:        1,
            detailType:   'simple',
          }),
        }
      )
      const data = await this.parseJSON<PocketGetResponse>(res)

      const pocketErr = this.checkPocketError(res.headers)
      if (pocketErr) {
        const code = res.headers.get('X-Error-Code')
        const isAuth = code === '107' || code === '158' || code === '152'
        return this.validationFailure(
          this.adapterError(isAuth ? 'AUTH_INVALID' : 'API_ERROR', pocketErr, false, res.status)
        )
      }

      if (!res.ok || data.status !== 1) {
        return this.validationFailure(this.classifyError(res.status, data, res.headers))
      }

      return {
        valid:         true,
        accountHandle: 'Pocket Account',
        accountName:   'Pocket User',
        scopes:        ['add', 'retrieve', 'modify'],
      }
    } catch (err) {
      return this.validationFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // publish (= save URL to Pocket)
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const accessToken = this.requireCredential(credentials, 'access_token')
      const consumerKey = this.requireCredential(credentials, 'consumer_key')

      if (!input.url) {
        return this.publishFailure(
          this.adapterError('API_ERROR', 'Pocket requires a URL to save', false)
        )
      }

      const tags = (input.tags ?? [])
        .slice(0, 8)
        .map((t) => t.replace(/^#+/, '').trim())
        .join(',')

      const body: Record<string, string> = {
        consumer_key: consumerKey,
        access_token: accessToken,
        url:          input.url,
      }
      if (input.title)  body['title']  = this.truncate(input.title, 255)
      if (tags)          body['tags']   = tags
      if (input.content) body['tweet_id'] = '' // unused; future: tweet context

      const res = await this.fetchWithTimeout(
        `${API_BASE}/add`,
        {
          method:  'POST',
          headers: POCKET_HEADERS,
          body:    JSON.stringify(body),
        }
      )
      const data = await this.parseJSON<PocketAddResponse>(res)

      const pocketErr = this.checkPocketError(res.headers)
      if (pocketErr) {
        return this.publishFailure(
          this.adapterError('API_ERROR', pocketErr, false, res.status)
        )
      }
      if (!res.ok || data.status !== 1) {
        return this.publishFailure(this.classifyError(res.status, data, res.headers))
      }

      const itemId = data.item?.item_id ?? data.item?.resolved_id
      return {
        success:         true,
        platformPostId:  itemId,
        platformPostUrl: data.item?.resolved_url ?? input.url,
      }
    } catch (err) {
      return this.publishFailure(this.networkError(err))
    }
  }

  // --------------------------------------------------------------------------
  // deletePost — permanently delete a saved item
  // --------------------------------------------------------------------------

  async deletePost(credentials: DecryptedCredentials, platformPostId: string): Promise<DeleteResult> {
    try {
      const accessToken = this.requireCredential(credentials, 'access_token')
      const consumerKey = this.requireCredential(credentials, 'consumer_key')

      const res = await this.fetchWithTimeout(
        `${API_BASE}/send`,
        {
          method:  'POST',
          headers: POCKET_HEADERS,
          body: JSON.stringify({
            consumer_key: consumerKey,
            access_token: accessToken,
            actions: [{ action: 'delete', item_id: platformPostId }],
          }),
        }
      )
      const data = await this.parseJSON<PocketSendResponse>(res)

      const pocketErr = this.checkPocketError(res.headers)
      if (pocketErr) {
        return this.deleteFailure(
          this.adapterError('API_ERROR', pocketErr, false, res.status)
        )
      }
      if (!res.ok) return this.deleteFailure(this.classifyError(res.status, data, res.headers))

      const success = data.action_results?.[0] ?? data.status === 1
      if (!success) {
        return this.deleteFailure(this.adapterError('NOT_FOUND', 'Item not found in Pocket', false))
      }
      return { success: true }
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
