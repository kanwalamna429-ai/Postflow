---
name: Credential column mismatch
description: /api/connections encrypts ALL credentials as a JSON blob in credentials_encrypted; publisher must read this column, not just access_token_enc.
---

## The rule
`publisher.ts` must try `credentials_encrypted` first before falling back to `access_token_enc`/`refresh_token_enc`.

**Why:** `/api/connections/route.ts` stores all credential fields (e.g. `{ api_key, publication_host }`) as a single AES-256-GCM encrypted JSON blob in `credentials_encrypted`. The legacy columns `access_token_enc`/`refresh_token_enc` are **never written** by the current UI. If publisher only reads the legacy columns, adapters receive empty credentials and fail with "Missing required credential: api_key".

## Encryption formats (two different formats in use)

| Column | Written by | Format |
|---|---|---|
| `credentials_encrypted` | `/api/connections` (Node crypto) | `base64(iv[12] + authTag[16] + ciphertext)` |
| `access_token_enc` | Legacy / manual | `ivHex:ciphertextHex` (Web Crypto) |

## How to apply
- `loadConnection` must select `credentials_encrypted` in addition to `access_token_enc`.
- `decryptCredentialsBlob(blob)` in `publisher.ts` decrypts the Node crypto format using `createDecipheriv('aes-256-gcm', ...)`.
- Priority in `publishOne`: if `credentialsEncrypted` is set, use it; else fall back to `decryptConnectionCredentials`.

## Also fixed alongside
- `BaseAdapter.networkError()` was checking `instanceof Error` before checking for plain `AdapterError` objects. `requireCredential` throws a plain `{ code, message, retryable }` object, so the error was re-wrapped as "Unknown network error". Fix: check `typeof err === 'object' && 'code' in err && 'message' in err` first.
