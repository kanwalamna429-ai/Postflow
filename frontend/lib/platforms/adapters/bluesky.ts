// =============================================================================
// Bluesky Adapter — AT Protocol (atproto.com)
// Auth: App Password (handle + app-specific password)
// API: bsky.social XRPC endpoints
// Docs: https://atproto.com/guides/applications
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

const BSKY_HOST = 'https://bsky.social'

interface BlueskySession {
  did: string
  handle: string
  accessJwt: string
  refreshJwt: string
  email?: string
}

interface BlueskyCreateRecordResponse {
  uri: string   // at://did/app.bsky.feed.post/rkey
  cid: string
}

export class BlueskyAdapter extends BaseAdapter {
  readonly platformId = 'bluesky' as const

  // --------------------------------------------------------------------------
  // Internal: create a session from handle + app_password
  // --------------------------------------------------------------------------

  private async createSession(credentials: DecryptedCredentials): Promise<BlueskySession> {
    const handle      = this.requireCredential(credentials, 'handle')
    const appPassword = this.requireCredential(credentials, 'app_password')

    const { status, data } = await this.postJSON<BlueskySession>(
      `${BSKY_HOST}/xrpc/com.atproto.server.createSession`,
      { identifier: handle, password: appPassword }
    )

    if (status !== 200) {
      throw this.classifyError(status, data)
    }
    return data
  }

  /** Extract the rkey (record key) from an AT URI. */
  private rkeyFromUri(uri: string): string {
    // Format: at://did/collection/rkey
    const parts = uri.split('/')
    return parts[parts.length - 1]
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const session = await this.createSession(credentials)
      return {
        valid:          true,
        accountHandle:  session.handle,
        accountName:    session.handle,
        platformUserId: session.did,
      }
    } catch (err) {
      const error = err instanceof Object && 'code' in err
        ? (err as ReturnType<typeof this.adapterError>)
        : this.networkError(err)
      return this.validationFailure(error)
    }
  }

  // --------------------------------------------------------------------------
  // publish
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const session = await this.createSession(credentials)
      const text    = this.buildPostText(input)

      const { status, data, headers } = await this.postJSON<BlueskyCreateRecordResponse>(
        `${BSKY_HOST}/xrpc/com.atproto.repo.createRecord`,
        {
          repo:       session.did,
          collection: 'app.bsky.feed.post',
          record: {
            $type:     'app.bsky.feed.post',
            text,
            createdAt: new Date().toISOString(),
            langs:     ['en'],
          },
        },
        { Authorization: `Bearer ${session.accessJwt}` }
      )

      if (status !== 200) {
        return this.publishFailure(this.classifyError(status, data, headers))
      }

      // Extract handle for URL: https://bsky.app/profile/{handle}/post/{rkey}
      const rkey = this.rkeyFromUri(data.uri)
      return {
        success:         true,
        platformPostId:  data.uri,          // full AT URI — use for delete
        platformPostUrl: `https://bsky.app/profile/${session.handle}/post/${rkey}`,
        ...this.parseRateLimitHeaders(headers),
      }
    } catch (err) {
      return this.publishFailure(
        err instanceof Object && 'code' in err
          ? (err as ReturnType<typeof this.adapterError>)
          : this.networkError(err)
      )
    }
  }

  // --------------------------------------------------------------------------
  // deletePost
  // --------------------------------------------------------------------------

  async deletePost(credentials: DecryptedCredentials, platformPostId: string): Promise<DeleteResult> {
    try {
      const session = await this.createSession(credentials)

      // platformPostId is the full AT URI: at://did/collection/rkey
      const rkey = this.rkeyFromUri(platformPostId)

      const { status, data, headers } = await this.postJSON(
        `${BSKY_HOST}/xrpc/com.atproto.repo.deleteRecord`,
        {
          repo:       session.did,
          collection: 'app.bsky.feed.post',
          rkey,
        },
        { Authorization: `Bearer ${session.accessJwt}` }
      )

      if (status !== 200) {
        return this.deleteFailure(this.classifyError(status, data, headers))
      }
      return { success: true }
    } catch (err) {
      return this.deleteFailure(
        err instanceof Object && 'code' in err
          ? (err as ReturnType<typeof this.adapterError>)
          : this.networkError(err)
      )
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private buildPostText(input: PublishInput): string {
    // Char limit: 300 graphemes. Keep tags if they fit.
    const LIMIT = 300
    const tagStr   = input.tags?.length ? '\n\n' + this.buildTagString(input.tags, '#', 4) : ''
    const withTags = this.truncate(input.content, LIMIT - tagStr.length) + tagStr
    return this.truncate(withTags, LIMIT)
  }
}
