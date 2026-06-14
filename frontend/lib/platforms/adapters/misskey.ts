// =============================================================================
// Misskey Adapter — Misskey API
// Auth: API key (access token) passed as `i` in every request body
// Docs: https://misskey-hub.net/docs/api/
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

interface MisskeyUser {
  id: string
  name: string | null
  username: string
  host: string | null
}

interface MisskeyNote {
  id: string
  url?: string
  uri?: string
}

interface MisskeyCreateNoteResponse {
  createdNote: MisskeyNote
}

export class MisskeyAdapter extends BaseAdapter {
  readonly platformId = 'misskey' as const

  private apiBase(instanceUrl: string): string {
    return instanceUrl.replace(/\/$/, '') + '/api'
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const instanceUrl = this.requireCredential(credentials, 'instance_url')
      const apiKey      = this.requireCredential(credentials, 'api_key')

      const { status, data } = await this.postJSON<MisskeyUser>(
        `${this.apiBase(instanceUrl)}/i`,
        { i: apiKey }
      )

      if (status !== 200) return this.validationFailure(this.classifyError(status, data))

      const hostname = new URL(instanceUrl).hostname
      return {
        valid:          true,
        accountHandle:  `@${data.username}@${hostname}`,
        accountName:    data.name ?? data.username,
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
      const apiKey      = this.requireCredential(credentials, 'api_key')

      // 3000-char limit
      const tagStr = input.tags?.length ? '\n\n' + this.buildTagString(input.tags, '#', 7) : ''
      const text   = this.truncate(input.content, 3000 - tagStr.length) + tagStr

      const { status, data } = await this.postJSON<MisskeyCreateNoteResponse>(
        `${this.apiBase(instanceUrl)}/notes/create`,
        {
          i:          apiKey,
          text,
          visibility: 'public',
          localOnly:  false,
        }
      )

      if (status !== 200) return this.publishFailure(this.classifyError(status, data))

      const note = data.createdNote
      const hostname = new URL(instanceUrl).hostname
      return {
        success:         true,
        platformPostId:  note.id,
        platformPostUrl: note.url ?? note.uri ?? `https://${hostname}/notes/${note.id}`,
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
      const apiKey      = this.requireCredential(credentials, 'api_key')

      const { status, data } = await this.postJSON(
        `${this.apiBase(instanceUrl)}/notes/delete`,
        { i: apiKey, noteId: platformPostId }
      )

      // Misskey returns 204 on success; 400 if note not found
      if (status === 204 || status === 200) return { success: true }
      if (status === 400) {
        // Treat "not found" as success (already deleted)
        return { success: true }
      }
      return this.deleteFailure(this.classifyError(status, data))
    } catch (err) {
      return this.deleteFailure(this.networkError(err))
    }
  }
}
