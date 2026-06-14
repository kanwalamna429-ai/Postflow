# PROJECT_CONTEXT.md

# Universal Content Distribution Platform

## Project Goal

Build a production-ready SaaS platform that republishes existing blog articles and web content across multiple social, publishing, and bookmarking platforms from a single dashboard.

The platform is currently designed for a single user but uses scalable architecture for future multi-user expansion.

---

## Technology Stack

### Frontend
- Next.js 15+ App Router
- TypeScript
- TailwindCSS
- shadcn/ui

### Backend Services
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase Edge Functions
- Supabase Scheduled Jobs

### AI
- Gemini API

### Deployment
- Vercel

---

## Architecture Rules

### NEVER USE

- Express
- Custom Node.js servers
- API servers outside Next.js Route Handlers
- node-cron
- cron package
- BullMQ
- Redis
- RabbitMQ
- Background workers
- Long-running Node processes
- WebSocket servers unless explicitly required later

### ALWAYS USE

- Next.js frontend
- Supabase backend services
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase Edge Functions
- Supabase Scheduled Jobs
- Vercel deployment

---

# Development Progress

## Phase 1 — Foundation & UI

Completed:

- Authentication UI
- Login
- Signup
- Logout
- Protected routes
- Dashboard layout
- Navigation
- Responsive design
- Dark mode
- Search components
- Filter components
- Pagination components
- Dashboard page
- Campaigns page
- URL Library page
- Platform Connections page
- Logs page
- Settings page
- Supabase client setup
- TypeScript models and interfaces

---

## Phase 2 — Database Architecture

Completed:

### Database Design

Created:

- users
- platform_connections
- campaigns
- campaign_urls
- extracted_content
- generated_content
- scheduled_posts
- published_posts
- media_assets
- system_logs
- settings

### Database Features

Implemented:

- UUID primary keys
- Foreign keys
- Indexes
- Constraints
- Triggers
- Timestamps
- Audit fields
- RLS policies
- Ownership policies
- Migration files

---

## Phase 3 — URL Ingestion & Metadata Extraction

Completed:

### URL Import

- Single URL import
- Bulk URL import
- Validation
- Duplicate detection
- Canonical URL detection

### Metadata Extraction

Priority Order:

1. Open Graph
2. Twitter Cards
3. JSON-LD
4. Meta Tags
5. HTML Parsing

Extracted Fields:

- Title
- Description
- Featured Image
- Canonical URL
- Site Name
- Author
- Publish Date

Stored permanently in database.

---

## Phase 4 — AI Content Generation

Completed:

### Gemini Integration

Implemented:

- Gemini API integration
- Prompt templates
- Content generation services
- Error handling
- Retry handling

### Generated Content Types

- Social posts
- Bookmark descriptions
- Article summaries
- Hashtags
- Alternative titles

Generated content stored in database before publishing.

---

## Phase 5 — Campaign Engine

Completed:

### Campaign Management

Fields:

- Name
- Description
- Platforms
- URLs
- Frequency
- Start Date
- Timezone
- Status

Statuses:

- Draft
- Active
- Paused
- Completed
- Archived

### Scheduling Architecture

Implemented:

- Immediate schedule generation
- Future publish timestamps generated when campaign is activated
- Scheduled post records stored in database

Important:

No runtime schedule generation.

All future publish records are created upfront.

---

## Phase 6 — Platform Expansion

Completed platform integrations.

### Social Platforms

- Bluesky
- Mastodon
- Misskey
- Pixelfed
- Reddit
- Tumblr

### Publishing Platforms

- Dev.to
- Hashnode

### Bookmarking Platforms

- Diigo
- Raindrop.io
- Pocket
- Instapaper

### Implemented For Every Platform

- Platform configuration
- Type definitions
- Connection management
- Credential storage
- Validation logic
- Logging integration
- Settings integration
- Future publishing compatibility
- AI content generation compatibility

### Connection Center Features

- Connect account
- Update credentials
- Test connection
- Disconnect account
- Connection status display

---

# Current Project Status

Completed Phases:

- Phase 1
- Phase 2
- Phase 3
- Phase 4
- Phase 5
- Phase 6

---

# Remaining Development

## Phase 7 — Publishing Engine

To Be Built

### Platform Adapters

Directory:

lib/platforms/

Adapters:

- bluesky.ts
- mastodon.ts
- misskey.ts
- pixelfed.ts
- devto.ts
- hashnode.ts
- reddit.ts
- tumblr.ts
- diigo.ts
- raindrop.ts
- pocket.ts
- instapaper.ts

Each adapter should expose:

- validateConnection()
- publish()
- deletePost()

### Publishing Workflow

1. Load scheduled record
2. Generate content if missing
3. Upload image if required
4. Publish to platform
5. Save API response
6. Save published URL
7. Update status

### Retry System

Attempt 1:
+1 minute

Attempt 2:
+5 minutes

Attempt 3:
+15 minutes

After 3 failures:

status = failed

### Logging

Track:

- Publish attempts
- Responses
- Errors
- Retry events

---

## Phase 7 — Supabase Edge Function

Create:

process-scheduled-posts

Responsibilities:

- Find due posts
- Lock records
- Prevent duplicate processing
- Publish content
- Save responses
- Save logs
- Handle retries
- Update status

Requirements:

- Idempotent
- Deno compatible
- Production ready

---

## Phase 8 — Production Hardening

Implement:

### Security

- Credential encryption
- CSRF protection
- Rate limiting
- Input validation
- Duplicate publishing prevention

### Reliability

- Error boundaries
- Monitoring hooks
- Audit logs
- Health checks

### Deployment

- Vercel optimization
- Supabase production configuration
- Environment validation
- Production readiness review

---

# Agent Rules

Before making any change:

1. Read entire repository.
2. Read this PROJECT_CONTEXT.md file.
3. Understand completed phases.
4. Reuse existing architecture.
5. Do not rewrite completed modules.
6. Do not refactor unrelated files.
7. Do not regenerate completed phases.
8. Only modify files relevant to the requested phase.
9. Show file paths before generating code.
10. Explain impact before modifying architecture.

---

# Critical Instruction

The next development phase is:

PHASE 7

Focus only on:

- Publishing Engine
- Platform Adapters
- Supabase Edge Functions
- Retry System
- Logging
- Idempotency
- Duplicate Prevention

Do not rebuild or redesign previously completed phases.
