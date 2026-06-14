"use client"

import { UrlStoreProvider } from "@/lib/url-store"
import { CampaignsProvider } from "@/lib/campaigns-store"
import { type ReactNode } from "react"

export function DashboardProviders({ children }: { children: ReactNode }) {
  return (
    <UrlStoreProvider>
      <CampaignsProvider>
        {children}
      </CampaignsProvider>
    </UrlStoreProvider>
  )
}
