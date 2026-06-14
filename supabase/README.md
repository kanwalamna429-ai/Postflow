# PostFlow — Supabase Database Architecture

## How to apply

Run all migrations **in order** against your Supabase project using the SQL Editor or the Supabase CLI.

### Option A — Supabase Dashboard SQL Editor

1. Open your project → **SQL Editor**
2. Paste and run each file in order:
   - `migrations/001_schema.sql`
   - `migrations/002_rls.sql`
   - `migrations/003_functions_triggers.sql`
   - `migrations/004_auth_hook.sql`

> All migrations are **idempotent** — safe to re-run.

### Option B — Supabase CLI

```bash
supabase db push
# or individually:
supabase db query < supabase/migrations/001_schema.sql
supabase db query < supabase/migrations/002_rls.sql
supabase db query < supabase/migrations/003_functions_triggers.sql
supabase db query < supabase/migrations/004_auth_hook.sql
```

---

## Schema overview

| Table | Soft Delete | RLS | Notes |
|---|---|---|---|
| `users` | ✓ | ✓ | Mirrors `auth.users`; created via trigger |
| `platform_connections` | ✓ | ✓ | OAuth tokens stored encrypted |
| `campaigns` | ✓ | ✓ | Soft-delete cascades to scheduled_posts |
| `campaign_urls` | ✓ | ✓ | Tracks clicks; supports short URLs |
| `extracted_content` | — | ✓ | Immutable scrape artifacts |
| `generated_content` | ✓ | ✓ | AI copy awaiting approval |
| `media_assets` | ✓ | ✓ | Linked to Supabase Storage |
| `scheduled_posts` | ✓ | ✓ | Pending queue; status lifecycle |
| `published_posts` | — | ✓ | Canonical publish record + engagement |
| `system_logs` | — | ✓ | Append-only audit trail |
| `settings` | — | ✓ | Per-user key/value config |

---

## Trigger map

| Trigger | Table | Event | Effect |
|---|---|---|---|
| `trg_*_set_updated_at` | all mutable tables | BEFORE UPDATE | Stamps `updated_at = NOW()` |
| `trg_generated_content_guard_approved_at` | `generated_content` | BEFORE INSERT/UPDATE | Auto-sets `approved_at`; clears on revoke |
| `trg_*_no_update_after_delete` | 6 soft-delete tables | BEFORE UPDATE | Blocks edits on soft-deleted rows |
| `trg_published_posts_incr_connection_count` | `published_posts` | AFTER INSERT | Increments `platform_connections.posts_published` |
| `trg_campaigns_cascade_soft_delete` | `campaigns` | AFTER UPDATE | Cancels pending `scheduled_posts` when campaign soft-deleted |
| `trg_scheduled_posts_log_status_change` | `scheduled_posts` | AFTER UPDATE | Appends audit row to `system_logs` on status change |
| `trg_published_posts_log_insert` | `published_posts` | AFTER INSERT | Appends success row to `system_logs` |
| `trg_platform_connections_log_status` | `platform_connections` | AFTER UPDATE | Logs connection status transitions |
| `trg_auth_users_on_new_user` | `auth.users` | AFTER INSERT | Creates profile + seeds default settings + logs signup |
| `trg_auth_users_on_delete_user` | `auth.users` | BEFORE DELETE | Soft-deletes profile + logs event |

---

## RLS policy pattern

Every table uses **ownership policies** — all reads, writes, and deletes are gated on:

```sql
user_id = auth.uid()
```

`FORCE ROW LEVEL SECURITY` is set on every table so even the table owner cannot bypass policies.

Backend workers that need cross-user access (e.g. a publishing worker) must use the **`service_role`** key, which bypasses RLS entirely.

---

## Security notes

- **Never expose** `service_role` key to the frontend.
- OAuth tokens (`access_token_enc`, `refresh_token_enc`) must be **AES-256 encrypted** at the application layer before `INSERT`/`UPDATE`.
- `system_logs` is append-only — no `DELETE` policy is defined, so rows cannot be removed via the client.
- `published_posts` has no `DELETE` policy — the canonical publish record is immutable from the client.
