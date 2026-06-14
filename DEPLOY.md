# PostFlow — Deployment Guide

Complete step-by-step guide to deploy PostFlow on **Vercel** with **Supabase** as the backend.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Setup](#2-supabase-setup)
3. [Generate Secrets Locally](#3-generate-secrets-locally)
4. [Vercel Deployment](#4-vercel-deployment)
5. [Connect Vercel ↔ Supabase](#5-connect-vercel--supabase)
6. [Post-Deploy Checklist](#6-post-deploy-checklist)
7. [Custom Domain (optional)](#7-custom-domain-optional)
8. [Environment Variable Reference](#8-environment-variable-reference)

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Required for local builds |
| pnpm | 9+ | `npm install -g pnpm` |
| Git | any | Repo must be pushed to GitHub / GitLab / Bitbucket |
| Supabase account | — | [supabase.com](https://supabase.com) — free tier is fine |
| Vercel account | — | [vercel.com](https://vercel.com) — free Hobby tier is fine |

---

## 2. Supabase Setup

### 2a. Create a new project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Choose your organisation, enter a **Project name** (e.g. `postflow-prod`)
3. Set a strong **Database Password** — save this somewhere safe, you will not see it again
4. Choose the **Region** closest to your users
5. Click **Create new project** — wait ~2 minutes for provisioning

### 2b. Get your API keys

1. In the Supabase dashboard, go to **Project Settings** (gear icon) → **API**
2. Copy these two values — you will need them in Vercel:

   | Value | Where to find it |
   |-------|-----------------|
   | **Project URL** | "Project URL" field, looks like `https://xxxxxxxxxxxx.supabase.co` |
   | **anon / public key** | "Project API keys" section → `anon` `public` |

   > **Never copy the `service_role` key into your frontend.** It bypasses Row Level Security.

### 2c. Configure Auth settings

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your Vercel production domain (you can update this after deploy):
   ```
   https://your-app.vercel.app
   ```
3. Under **Redirect URLs**, add:
   ```
   https://your-app.vercel.app/**
   https://your-app.vercel.app/auth/callback
   ```
   If using a custom domain, add that too:
   ```
   https://yourdomain.com/**
   ```
4. Click **Save**

### 2d. Configure Email Auth

1. Go to **Authentication** → **Providers** → **Email**
2. Confirm these settings:
   - ✅ **Enable Email provider** — on
   - **Confirm email** — on (recommended for production)
   - **Secure email change** — on
3. Click **Save**

### 2e. (Optional) Disable email confirmation for testing

If you want to skip email confirmation during initial setup:

1. **Authentication** → **Providers** → **Email**
2. Toggle **Confirm email** → off
3. Re-enable before going live

### 2f. SMTP settings (production email)

By default Supabase uses its own rate-limited SMTP relay (good enough for testing). For production with real users:

1. **Project Settings** → **Authentication** → **SMTP Settings**
2. Enable **Custom SMTP** and enter credentials from your email provider (Resend, SendGrid, Postmark, etc.)
3. Set **Sender email** and **Sender name**

### 2g. Run Database Migrations

PostFlow uses incremental migrations. **Run them in order** from the Supabase SQL Editor.

#### Step-by-step

1. Go to **SQL Editor** in your Supabase project → **New query**
2. For each file below, paste its full contents and click **Run**:

| Order | File | What it creates |
|-------|------|----------------|
| 1 | `supabase/migrations/001_initial.sql` | Core tables: campaigns, campaign\_urls, platform\_connections, system\_logs |
| 2 | `supabase/migrations/005_new_platforms.sql` | Expands platform CHECK constraints to 17 platforms |
| 3 | `supabase/migrations/006_campaign_engine.sql` | frequency\_type/value columns; url\_id on scheduled\_posts |
| 4 | `supabase/migrations/007_phase7_publishing.sql` | Locking/retry columns; published\_posts columns |
| 5 | `supabase/migrations/008_fix_platform_constraints.sql` | Fixes any duplicate platform CHECK constraints |
| 6 | `supabase/migrations/009_campaigns_store_columns.sql` | Denormalised counter columns on campaigns |
| 7 | `supabase/migrations/010_ensure_scheduled_posts.sql` | Creates scheduled\_posts, extracted\_content, generated\_content if missing; ensures all columns exist |

> **Already ran some migrations?** Every file is idempotent — safe to run again. If you see `already exists` errors they are harmless.

#### Shortcut for new deployments

If this is a **fresh** Supabase project, you can run just two files in order:

1. `supabase/migrations/001_schema.sql` — full schema (all tables, all columns)
2. `supabase/migrations/002_rls.sql` — Row Level Security policies
3. `supabase/migrations/010_ensure_scheduled_posts.sql` — catches any gaps

Then run `005`, `006`, `007`, `008`, `009` for completeness (they are all idempotent).

3. Verify RLS is enabled: **Table Editor** → select any table → **RLS** tab → should show **Enabled**

---

## 3. Generate Secrets Locally

Run these commands in your terminal to generate strong secrets:

```bash
# POSTFLOW_ENCRYPTION_KEY — must be exactly 64 hex characters
openssl rand -hex 32

# PROCESS_POSTS_SECRET — any strong random string
openssl rand -hex 32
```

Save both outputs — you will enter them as Vercel environment variables in the next step.

---

## 4. Vercel Deployment

### 4a. Import your repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and authorise Vercel to access your GitHub/GitLab/Bitbucket account
3. Find your PostFlow repository and click **Import**

### 4b. Configure the project

On the "Configure Project" screen:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `frontend` |
| **Build Command** | `pnpm build` *(or leave as auto-detected)* |
| **Output Directory** | `.next` *(auto-detected)* |
| **Install Command** | `pnpm install` |
| **Node.js Version** | 20.x |

> **Root Directory is critical.** The `package.json` and Next.js app live inside `frontend/`, not the repo root. If you skip this Vercel will fail to find the app.

To set Root Directory: click **Edit** next to "Root Directory" → type `frontend` → click **Continue**.

### 4c. Add environment variables

Before clicking **Deploy**, scroll down to **Environment Variables** and add each variable:

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon key) | Production, Preview, Development |
| `POSTFLOW_ENCRYPTION_KEY` | 64-char hex string | Production, Preview |
| `PROCESS_POSTS_SECRET` | 32-char hex string | Production, Preview |
| `GEMINI_API_KEY` | `AIza...` | Production, Preview |

> Click **Add** after each variable. Make sure all five are listed before deploying.

### 4d. Deploy

Click **Deploy**. Vercel will:

1. Clone your repository
2. Install dependencies with `pnpm install`
3. Run `next build`
4. Deploy to the global edge network

First deploy takes ~2–3 minutes. You will get a URL like:
```
https://postflow-abc123.vercel.app
```

### 4e. Check build logs

If the build fails, click **View Build Logs**. Common failures:

| Error | Fix |
|-------|-----|
| `Cannot find module` | Check Root Directory is set to `frontend` |
| `NEXT_PUBLIC_SUPABASE_URL is not set` | Add the env vars and redeploy |
| `pnpm: command not found` | Vercel auto-installs pnpm; ensure Install Command is `pnpm install` |
| `Type error: ...` | Run `pnpm build` locally first to catch TypeScript errors |

---

## 5. Connect Vercel ↔ Supabase

### 5a. Update Supabase redirect URLs with your real domain

Now that you have a Vercel URL, go back to Supabase:

1. **Authentication** → **URL Configuration**
2. Update **Site URL**:
   ```
   https://postflow-abc123.vercel.app
   ```
3. Update **Redirect URLs** — add:
   ```
   https://postflow-abc123.vercel.app/**
   https://postflow-abc123.vercel.app/auth/callback
   ```
4. Click **Save**

### 5b. (Optional) Use Vercel's native Supabase integration

Vercel has a first-party Supabase integration that automatically injects the env vars:

1. In your Vercel project → **Settings** → **Integrations**
2. Search for **Supabase** → **Add Integration**
3. Select your Supabase project and follow the prompts
4. Vercel will automatically add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to all environments

If you use this, **remove the manually added Supabase vars first** to avoid duplicates.

---

## 6. Post-Deploy Checklist

Run through these after your first successful deploy:

- [ ] Visit `https://your-app.vercel.app` — app loads without errors
- [ ] Visit `https://your-app.vercel.app/api/health` — returns `{"status":"ok"}`
- [ ] Sign up with a test email — account created successfully
- [ ] Check the confirmation email arrives (or bypass is working)
- [ ] Log in with the test account — redirected to `/dashboard`
- [ ] Log out — redirected to `/login`
- [ ] Open browser DevTools → Console — no red errors
- [ ] Check Supabase Dashboard → **Authentication** → **Users** — test user appears

---

## 7. Custom Domain (optional)

### On Vercel

1. **Project Settings** → **Domains** → **Add Domain**
2. Enter your domain (e.g. `app.yourdomain.com`)
3. Follow the DNS instructions — add a CNAME record at your DNS provider:
   ```
   CNAME  app  cname.vercel-dns.com
   ```
4. Wait for DNS propagation (up to 48 hours, usually under 10 minutes)

### Update Supabase

After your custom domain is live, go back to Supabase → **Authentication** → **URL Configuration** and update Site URL and Redirect URLs to your custom domain.

---

## 8. Environment Variable Reference

| Variable | Required | Exposed to Browser | Description |
|----------|----------|--------------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | ✅ Yes | Supabase project URL. Found in Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | ✅ Yes | Supabase anon/public key. Found in Project Settings → API. Safe to expose — RLS protects your data. |
| `POSTFLOW_ENCRYPTION_KEY` | Recommended | ❌ No | 64 hex chars (32 bytes). Encrypts stored OAuth access tokens at rest. Generate with `openssl rand -hex 32`. |
| `PROCESS_POSTS_SECRET` | Recommended | ❌ No | Shared secret between this app and the Supabase Edge Function that triggers `/api/process-posts`. Generate with `openssl rand -hex 32`. |
| `GEMINI_API_KEY` | Optional | ❌ No | Google Gemini API key for AI caption generation. Get one at [aistudio.google.com](https://aistudio.google.com/app/apikey). |

### Local development

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp frontend/.env.example frontend/.env.local
```

`.env.local` is git-ignored by default in Next.js. Never commit it.

```bash
# Verify it is ignored
git check-ignore -v frontend/.env.local
# Expected: frontend/.gitignore:1:.env.local
```
