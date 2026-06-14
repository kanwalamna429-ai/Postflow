import { createBrowserClient } from "@supabase/ssr"

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!isValidUrl(url) || !key) {
    throw new Error(
      "Supabase credentials are missing or invalid.\n" +
        "NEXT_PUBLIC_SUPABASE_URL must be a valid https:// URL.\n" +
        "Find your credentials at: https://supabase.com/dashboard/project/_/settings/api"
    )
  }

  return createBrowserClient(url!, key)
}
