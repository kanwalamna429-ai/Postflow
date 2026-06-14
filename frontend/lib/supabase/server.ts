import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!isValidUrl(url) || !key) {
    throw new Error(
      "Supabase credentials are missing or invalid.\n" +
        "NEXT_PUBLIC_SUPABASE_URL must be a valid https:// URL."
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url!, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}
