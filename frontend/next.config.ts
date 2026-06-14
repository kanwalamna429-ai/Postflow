import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // allowedDevOrigins is Replit-only — not needed on Vercel
  ...(process.env.REPL_ID
    ? {
        allowedDevOrigins: [
          "*.replit.dev",
          "*.sisko.replit.dev",
          "*.pike.replit.dev",
          "*.repl.co",
        ],
      }
    : {}),
}

export default nextConfig
