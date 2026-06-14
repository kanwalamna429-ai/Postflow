import { Sidebar } from "@/components/layout/sidebar"
import { DashboardProviders } from "@/components/layout/dashboard-providers"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardProviders>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="lg:pl-64 flex flex-col min-h-screen">
          {children}
        </div>
      </div>
    </DashboardProviders>
  )
}
