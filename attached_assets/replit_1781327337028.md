# PostFlow — SaaS Frontend

A production-ready social media automation SaaS frontend built with Next.js 15 App Router, TypeScript, TailwindCSS, shadcn/ui, and Supabase.

## Project structure

```
frontend/                    # Next.js 15 app (all code lives here)
├── app/
│   ├── (auth)/              # Public auth pages
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/         # Protected dashboard routes
│   │   ├── layout.tsx       # Shared sidebar layout
│   │   ├── dashboard/       # /dashboard — stats overview
│   │   ├── campaigns/       # /campaigns — campaign list
│   │   ├── url-library/     # /url-library — shortened URLs
│   │   ├── connections/     # /connections — platform OAuth
│   │   ├── logs/            # /logs — publish event logs
│   │   └── settings/        # /settings — workspace config
│   ├── globals.css          # CSS custom properties (design tokens)
│   └── layout.tsx           # Root layout + ThemeProvider
├── components/
│   ├── ui/                  # shadcn/ui primitives
│   └── layout/              # Sidebar, Header, MobileNav, Pagination, SearchFilter
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client
│   │   └── server.ts        # Server-side client (cookies)
│   ├── mock-data.ts         # All mock data (campaigns, URLs, connections, logs)
│   └── utils.ts             # cn() utility
└── middleware.ts             # Auth guard — redirects unauthenticated users
```

## Tech stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict)
- **Styling**: TailwindCSS v4 + CSS custom properties
- **Components**: shadcn/ui primitives (Radix UI)
- **Auth**: Supabase Auth (email/password)
- **Database**: Supabase PostgreSQL (wired up, mock data used for now)
- **Theme**: next-themes (system / light / dark)
- **Icons**: lucide-react

## Environment variables required

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Running locally

```bash
cd frontend
pnpm dev
```

## Pages

| Route | Description |
|---|---|
| `/login` | Email/password sign in |
| `/signup` | Account creation with email confirmation |
| `/dashboard` | Stats overview with 7 KPI cards |
| `/campaigns` | Campaign list with search, status filter, pagination |
| `/url-library` | Shortened URL management with click counts |
| `/connections` | Platform OAuth connection management |
| `/logs` | Real-time publish event log with level + platform filter |
| `/settings` | Profile, notifications, team, billing, danger zone |

## User preferences

- No Express, Node server, custom backend, Redis, BullMQ, RabbitMQ, or background workers
- Supabase for all backend services
- Mock data only (no SQL generation)
- No Edge Functions
- No publishing logic
