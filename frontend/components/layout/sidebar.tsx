"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  Link2,
  Plug2,
  ScrollText,
  Settings,
  Zap,
  LogOut,
  FileEdit,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/campaigns",   label: "Campaigns",   icon: Megaphone        },
  { href: "/content",     label: "Content",     icon: FileEdit         },
  { href: "/url-library", label: "URL Library", icon: Link2            },
  { href: "/connections", label: "Connections", icon: Plug2            },
  { href: "/logs",        label: "Logs",        icon: ScrollText       },
  { href: "/settings",    label: "Settings",    icon: Settings         },
]

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // ignore client creation errors
    }
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r bg-card min-h-screen fixed top-0 left-0 z-30">
      <div className="flex items-center gap-2.5 px-6 h-16 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-base tracking-tight">PostFlow</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 pb-4 space-y-2">
        <div className="rounded-md bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Free Plan</p>
          <p className="mt-0.5">5 of 10 connections used</p>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-primary" />
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
