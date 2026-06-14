// =============================================================================
// Credential Encryption / Decryption
// AES-256-GCM via Web Crypto API (works in Node.js 18+ and browsers).
// Server-side only — never import in client components.
//
// Environment variable required:
//   POSTFLOW_ENCRYPTION_KEY — 64 hex characters (32 bytes)
//   Generate with: openssl rand -hex 32
// =============================================================================

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) throw new Error('Hex string must have even length')
  const buf   = new ArrayBuffer(hex.length / 2)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getEncryptionKey(): string {
  const key = process.env.POSTFLOW_ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error(
      'POSTFLOW_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    )
  }
  return key
}

async function importKey(keyHex: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const keyBytes = hexToBytes(keyHex)
  return globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    usage
  )
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Output format: `<12-byte-iv-hex>:<ciphertext-hex>`
 */
export async function encrypt(plaintext: string, keyHex?: string): Promise<string> {
  const resolvedKey = keyHex ?? getEncryptionKey()
  const key  = await importKey(resolvedKey, ['encrypt'])
  const iv   = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const data = new TextEncoder().encode(plaintext)

  const cipherBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )

  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(cipherBuf))}`
}

/**
 * Decrypt a ciphertext string produced by `encrypt()`.
 * Input format: `<12-byte-iv-hex>:<ciphertext-hex>`
 */
export async function decrypt(ciphertext: string, keyHex?: string): Promise<string> {
  const resolvedKey = keyHex ?? getEncryptionKey()
  const colonIdx = ciphertext.indexOf(':')
  if (colonIdx === -1) throw new Error('Invalid ciphertext format — expected iv:ciphertext')

  const ivHex = ciphertext.slice(0, colonIdx)
  const ctHex = ciphertext.slice(colonIdx + 1)

  const key       = await importKey(resolvedKey, ['decrypt'])
  const iv        = hexToBytes(ivHex)
  const ct        = hexToBytes(ctHex)

  const plainBuf = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct
  )

  return new TextDecoder().decode(plainBuf)
}

// ---------------------------------------------------------------------------
// Convenience wrappers (use POSTFLOW_ENCRYPTION_KEY from env)
// ---------------------------------------------------------------------------

/** Encrypt a credential value before storing in Supabase. */
export async function encryptCredential(value: string): Promise<string> {
  return encrypt(value)
}

/** Decrypt a credential value retrieved from Supabase. */
export async function decryptCredential(encryptedValue: string): Promise<string> {
  return decrypt(encryptedValue)
}

/**
 * Decrypt all encrypted credential fields for a connection and merge with
 * plaintext metadata fields.
 *
 * @param accessTokenEnc  Encrypted value from platform_connections.access_token_enc
 * @param refreshTokenEnc Encrypted value from platform_connections.refresh_token_enc
 * @param metadata        Raw metadata JSONB from platform_connections.metadata
 * @param fieldMap        Maps CredentialField.key → 'access_token' | 'refresh_token' | null
 *                        for encrypted fields.
 */
export async function decryptConnectionCredentials(params: {
  accessTokenEnc?: string | null
  refreshTokenEnc?: string | null
  metadata?: Record<string, unknown>
  /** Which credential key maps to access_token_enc */
  accessTokenFieldKey?: string
  /** Which credential key maps to refresh_token_enc */
  refreshTokenFieldKey?: string
}): Promise<Record<string, string>> {
  const {
    accessTokenEnc,
    refreshTokenEnc,
    metadata = {},
    accessTokenFieldKey = 'access_token',
    refreshTokenFieldKey = 'refresh_token',
  } = params

  const credentials: Record<string, string> = {}

  // Decrypt encrypted fields
  if (accessTokenEnc) {
    credentials[accessTokenFieldKey] = await decryptCredential(accessTokenEnc)
  }
  if (refreshTokenEnc) {
    credentials[refreshTokenFieldKey] = await decryptCredential(refreshTokenEnc)
  }

  // Copy plaintext metadata fields
  for (const [k, v] of Object.entries(metadata)) {
    if (typeof v === 'string') {
      credentials[k] = v
    }
  }

  return credentials
}

// ---------------------------------------------------------------------------
// Key validation utility
// ---------------------------------------------------------------------------

/** Returns true if the POSTFLOW_ENCRYPTION_KEY env var is correctly set. */
export function isEncryptionKeyConfigured(): boolean {
  try {
    getEncryptionKey()
    return true
  } catch {
    return false
  }
}
