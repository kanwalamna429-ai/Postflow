// =============================================================================
// Mock Data — Types only
// All data arrays are empty. Pages show proper empty states.
// Connect real Supabase data sources when deploying to production.
// =============================================================================

export type Platform =
  | "twitter" | "linkedin" | "instagram" | "facebook" | "tiktok"
  | "bluesky" | "mastodon" | "misskey" | "pixelfed" | "tumblr"
  | "devto" | "hashnode" | "reddit"
  | "diigo" | "raindrop" | "pocket" | "instapaper"

export type CampaignStatus =
  | "active" | "scheduled" | "paused" | "completed" | "draft" | "archived"

export interface Campaign {
  id: string
  name: string
  description?: string
  status: CampaignStatus
  platforms: Platform[]
  scheduledPosts: number
  publishedPosts: number
  failedPosts: number
  startDate: string
  endDate: string
  successRate: number
  frequency?: string
  timezone?: string
  urlCount?: number
}

export const mockCampaigns: Campaign[] = []

export interface UrlEntry {
  id: string
  title: string
  originalUrl: string
  shortUrl: string
  clicks: number
  campaigns: string[]
  createdAt: string
  tags: string[]
}

export const mockUrls: UrlEntry[] = []

export interface Connection {
  id: string
  platform: Platform
  accountName: string
  accountHandle: string
  status: "connected" | "error" | "disconnected"
  connectedAt: string
  lastSync: string
  postsPublished: number
  instanceUrl?: string
}

export const mockConnections: Connection[] = []

export type LogLevel = "success" | "error" | "warning" | "info"

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  campaign: string
  platform: Platform
  message: string
  postId?: string
}

export const mockLogs: LogEntry[] = []

export const mockStats = {
  totalCampaigns: 0,
  activeCampaigns: 0,
  scheduledPosts: 0,
  publishedPosts: 0,
  failedPosts: 0,
  connectedPlatforms: 0,
  successRate: 0,
}
