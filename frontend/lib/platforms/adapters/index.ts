// =============================================================================
// Platform Adapter Registry
// Single entry point for all platform adapters.
// Usage:
//   import { getAdapter } from '@/lib/platforms/adapters'
//   const result = await getAdapter('bluesky').validateConnection(credentials)
// =============================================================================

export type {
  DecryptedCredentials,
  PublishInput,
  PublishResult,
  ValidationResult,
  DeleteResult,
  AdapterError,
  AdapterErrorCode,
  PlatformAdapter,
  StoredConnectionCredentials,
  PublishContentType,
} from './types'

export { encrypt, decrypt, encryptCredential, decryptCredential, decryptConnectionCredentials, isEncryptionKeyConfigured } from './crypto'

import type { PlatformAdapter }  from './types'
import type { AllPlatformId }    from '../types'

import { BlueskyAdapter }    from './bluesky'
import { MastodonAdapter }   from './mastodon'
import { MisskeyAdapter }    from './misskey'
import { PixelfedAdapter }   from './pixelfed'
import { TumblrAdapter }     from './tumblr'
import { DevToAdapter }      from './devto'
import { HashnodeAdapter }   from './hashnode'
import { RedditAdapter }     from './reddit'
import { DiigoAdapter }      from './diigo'
import { RaindropAdapter }   from './raindrop'
import { PocketAdapter }     from './pocket'
import { InstapaperAdapter } from './instapaper'

// ---------------------------------------------------------------------------
// Singleton instances
// Adapters are stateless — one instance per platform is sufficient.
// ---------------------------------------------------------------------------

const _adapters: Partial<Record<AllPlatformId, PlatformAdapter>> = {
  bluesky:    new BlueskyAdapter(),
  mastodon:   new MastodonAdapter(),
  misskey:    new MisskeyAdapter(),
  pixelfed:   new PixelfedAdapter(),
  tumblr:     new TumblrAdapter(),
  devto:      new DevToAdapter(),
  hashnode:   new HashnodeAdapter(),
  reddit:     new RedditAdapter(),
  diigo:      new DiigoAdapter(),
  raindrop:   new RaindropAdapter(),
  pocket:     new PocketAdapter(),
  instapaper: new InstapaperAdapter(),
}

// Read-only view of the registry
export const ADAPTER_REGISTRY: Readonly<Partial<Record<AllPlatformId, PlatformAdapter>>> = _adapters

/**
 * Get the adapter for a platform by ID.
 * @throws Error if no adapter is registered for the given platform.
 */
export function getAdapter(platformId: string): PlatformAdapter {
  const adapter = _adapters[platformId as AllPlatformId]
  if (!adapter) {
    throw new Error(
      `No adapter registered for platform "${platformId}". ` +
      `Supported: ${Object.keys(_adapters).join(', ')}`
    )
  }
  return adapter
}

/**
 * Returns true if an adapter exists for the given platform ID.
 */
export function hasAdapter(platformId: string): boolean {
  return platformId in _adapters
}

/**
 * Returns the list of all platform IDs that have registered adapters.
 */
export function getSupportedPlatformIds(): AllPlatformId[] {
  return Object.keys(_adapters) as AllPlatformId[]
}
