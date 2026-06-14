// =============================================================================
// Input Validation Schemas — Phase 8
// Pure TypeScript validation (no extra dependencies).
// Each validator returns { valid, errors } — never throws.
// =============================================================================

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

function required(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return `${label} is required`
  if (typeof value === "string" && !value.trim()) return `${label} is required`
  return null
}

function maxLength(value: string, max: number, label: string): string | null {
  if (value.length > max) return `${label} must be at most ${max} characters`
  return null
}

function minLength(value: string, min: number, label: string): string | null {
  if (value.trim().length < min) return `${label} must be at least ${min} characters`
  return null
}

function isUrl(value: string, label: string): string | null {
  try {
    const u = new URL(value)
    if (!["http:", "https:"].includes(u.protocol)) return `${label} must use http or https`
    return null
  } catch {
    return `${label} must be a valid URL`
  }
}

function isHttpsUrl(value: string, label: string): string | null {
  try {
    const u = new URL(value)
    if (u.protocol !== "https:") return `${label} must use https://`
    return null
  } catch {
    return `${label} must be a valid HTTPS URL`
  }
}

function collect(errors: Record<string, string>, key: string, err: string | null) {
  if (err) errors[key] = err
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export interface CampaignInput {
  name: string
  description?: string
  platforms: string[]
  startDate: string
  endDate: string
  frequency?: string
  timezone?: string
}

export function validateCampaign(input: Partial<CampaignInput>): ValidationResult {
  const errors: Record<string, string> = {}

  collect(errors, "name", required(input.name, "Campaign name"))
  if (input.name) {
    collect(errors, "name", minLength(input.name, 2, "Campaign name"))
    collect(errors, "name", maxLength(input.name, 120, "Campaign name"))
  }

  if (!input.platforms || input.platforms.length === 0) {
    errors.platforms = "Select at least one platform"
  }

  collect(errors, "startDate", required(input.startDate, "Start date"))
  collect(errors, "endDate",   required(input.endDate,   "End date"))

  if (input.startDate && input.endDate) {
    const start = new Date(input.startDate)
    const end   = new Date(input.endDate)
    if (isNaN(start.getTime())) errors.startDate = "Invalid start date"
    else if (isNaN(end.getTime())) errors.endDate = "Invalid end date"
    else if (end <= start) errors.endDate = "End date must be after start date"
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// URL entry
// ---------------------------------------------------------------------------

export interface UrlInput {
  title?: string
  originalUrl: string
  tags?: string[]
}

export function validateUrl(input: Partial<UrlInput>): ValidationResult {
  const errors: Record<string, string> = {}

  collect(errors, "originalUrl", required(input.originalUrl, "URL"))
  if (input.originalUrl) {
    collect(errors, "originalUrl", isUrl(input.originalUrl, "URL"))
  }

  if (input.title) {
    collect(errors, "title", maxLength(input.title, 200, "Title"))
  }

  if (input.tags && input.tags.length > 20) {
    errors.tags = "Maximum 20 tags allowed"
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// Platform connection credentials
// ---------------------------------------------------------------------------

export interface CredentialInput {
  accountHandle: string
  accountName?: string
  instanceUrl?: string
  credentials: Record<string, string>
}

export function validateCredentials(
  input: Partial<CredentialInput>,
  requiredFields: Array<{ key: string; label: string; required: boolean }>,
  requiresInstance: boolean
): ValidationResult {
  const errors: Record<string, string> = {}

  collect(errors, "accountHandle", required(input.accountHandle, "Account handle"))

  if (requiresInstance) {
    collect(errors, "instanceUrl", required(input.instanceUrl, "Instance URL"))
    if (input.instanceUrl) {
      collect(errors, "instanceUrl", isHttpsUrl(input.instanceUrl, "Instance URL"))
    }
  }

  for (const field of requiredFields) {
    if (!field.required) continue
    const val = input.credentials?.[field.key] ?? ""
    collect(errors, field.key, required(val, field.label))
    if (val) {
      collect(errors, field.key, minLength(val, 4, field.label))
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// Process-posts API
// ---------------------------------------------------------------------------

export interface ProcessPostsInput {
  campaignId?: string
  dryRun?: boolean
}

export function validateProcessPosts(body: unknown): ValidationResult {
  const errors: Record<string, string> = {}

  if (typeof body !== "object" || body === null) {
    errors._root = "Request body must be a JSON object"
    return { valid: false, errors }
  }

  const b = body as Record<string, unknown>

  if (b.campaignId !== undefined) {
    if (typeof b.campaignId !== "string") {
      errors.campaignId = "campaignId must be a string"
    } else if (!/^[0-9a-f-]{36}$/.test(b.campaignId)) {
      errors.campaignId = "campaignId must be a valid UUID"
    }
  }

  if (b.dryRun !== undefined && typeof b.dryRun !== "boolean") {
    errors.dryRun = "dryRun must be a boolean"
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

export interface GenerateContentInput {
  url: string
  platforms: string[]
  tone?: string
  campaignId?: string
}

export function validateGenerateContent(body: unknown): ValidationResult {
  const errors: Record<string, string> = {}

  if (typeof body !== "object" || body === null) {
    errors._root = "Request body must be a JSON object"
    return { valid: false, errors }
  }

  const b = body as Record<string, unknown>

  collect(errors, "url", required(b.url, "URL"))
  if (typeof b.url === "string" && b.url) {
    collect(errors, "url", isUrl(b.url, "URL"))
  }

  if (!Array.isArray(b.platforms) || b.platforms.length === 0) {
    errors.platforms = "At least one platform is required"
  }

  if (b.tone !== undefined && typeof b.tone !== "string") {
    errors.tone = "tone must be a string"
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
