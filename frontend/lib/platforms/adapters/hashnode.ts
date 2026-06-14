// =============================================================================
// Hashnode Adapter — Hashnode GraphQL API v2
// Auth: Personal Access Token (Authorization: Bearer)
// Docs: https://apidocs.hashnode.com/
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

const GQL_URL = 'https://gql.hashnode.com'

// ---------------------------------------------------------------------------
// GraphQL response shapes
// ---------------------------------------------------------------------------

interface GqlResponse<T> {
  data?: T
  errors?: Array<{ message: string; locations?: unknown[]; path?: unknown[] }>
}

interface MeData {
  me: { id: string; name: string; username: string }
}

interface PublicationData {
  publication: { id: string; title: string } | null
}

interface PublishPostData {
  publishPost: { post: { id: string; url: string; slug: string } }
}

interface RemovePostData {
  removePost: { post: { id: string } }
}

export class HashnodeAdapter extends BaseAdapter {
  readonly platformId = 'hashnode' as const

  // --------------------------------------------------------------------------
  // Internal GraphQL executor
  // --------------------------------------------------------------------------

  private async gql<T>(
    query: string,
    variables: Record<string, unknown>,
    apiKey: string
  ): Promise<GqlResponse<T>> {
    const { status, data } = await this.postJSON<GqlResponse<T>>(
      GQL_URL,
      { query, variables },
      this.bearer(apiKey)
    )

    if (status === 401) throw this.adapterError('AUTH_INVALID', 'Invalid Hashnode API key', false, status)
    if (status !== 200) throw this.adapterError('API_ERROR', `GraphQL HTTP ${status}`, status >= 500, status)

    return data
  }

  /** Fetch publication ID from the configured host. */
  private async getPublicationId(host: string, apiKey: string): Promise<string> {
    const result = await this.gql<PublicationData>(
      `query Publication($host: String!) { publication(host: $host) { id title } }`,
      { host },
      apiKey
    )
    const pub = result.data?.publication
    if (!pub) {
      throw this.adapterError(
        'NOT_FOUND',
        `No Hashnode publication found for host: ${host}. Check your Publication Host setting.`,
        false
      )
    }
    return pub.id
  }

  // --------------------------------------------------------------------------
  // validateConnection
  // --------------------------------------------------------------------------

  async validateConnection(credentials: DecryptedCredentials): Promise<ValidationResult> {
    try {
      const apiKey          = this.requireCredential(credentials, 'api_key')
      const publicationHost = this.requireCredential(credentials, 'publication_host')

      // Verify token via /me
      const result = await this.gql<MeData>(
        `query { me { id name username } }`,
        {},
        apiKey
      )

      if (result.errors?.length) {
        return this.validationFailure(
          this.adapterError('AUTH_INVALID', result.errors[0].message, false)
        )
      }

      // Also verify the publication host resolves
      await this.getPublicationId(publicationHost, apiKey)

      const me = result.data?.me
      return {
        valid:          true,
        accountHandle:  me?.username ?? publicationHost,
        accountName:    me?.name ?? publicationHost,
        platformUserId: me?.id,
      }
    } catch (err) {
      return this.validationFailure(
        err instanceof Object && 'code' in err
          ? (err as ReturnType<typeof this.adapterError>)
          : this.networkError(err)
      )
    }
  }

  // --------------------------------------------------------------------------
  // publish
  // --------------------------------------------------------------------------

  async publish(credentials: DecryptedCredentials, input: PublishInput): Promise<PublishResult> {
    try {
      const apiKey          = this.requireCredential(credentials, 'api_key')
      const publicationHost = this.requireCredential(credentials, 'publication_host')

      const publicationId = await this.getPublicationId(publicationHost, apiKey)

      const title           = input.title ?? this.truncate(input.content, 120)
      const contentMarkdown = this.buildMarkdown(input)
      const tags            = (input.tags ?? [])
        .slice(0, 5)
        .map((t) => ({ name: t.replace(/^#+/, '').trim(), slug: t.replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-') }))

      const MUTATION = `
        mutation PublishPost($input: PublishPostInput!) {
          publishPost(input: $input) {
            post { id url slug }
          }
        }
      `

      const result = await this.gql<PublishPostData>(
        MUTATION,
        {
          input: {
            title,
            contentMarkdown,
            publicationId,
            tags,
            ...(input.url ? { originalArticleURL: input.url } : {}),
          },
        },
        apiKey
      )

      if (result.errors?.length) {
        return this.publishFailure(
          this.adapterError('CONTENT_REJECTED', result.errors[0].message, false)
        )
      }

      const post = result.data?.publishPost?.post
      return {
        success:         true,
        platformPostId:  post?.id ?? '',
        platformPostUrl: post?.url ?? '',
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
      const apiKey = this.requireCredential(credentials, 'api_key')

      const MUTATION = `
        mutation RemovePost($id: ID!) {
          removePost(id: $id) { post { id } }
        }
      `
      const result = await this.gql<RemovePostData>(MUTATION, { id: platformPostId }, apiKey)

      if (result.errors?.length) {
        const msg = result.errors[0].message
        if (msg.toLowerCase().includes('not found')) return { success: true }
        return this.deleteFailure(this.adapterError('API_ERROR', msg, false))
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

  private buildMarkdown(input: PublishInput): string {
    let md = input.content
    if (input.url) {
      md += `\n\n---\n> Originally published at [${input.url}](${input.url})`
    }
    return this.truncate(md, 50_000)
  }
}
