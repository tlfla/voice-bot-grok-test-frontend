import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Voice Bot - Chat with AI",
  description: "Real-time voice conversation with AI",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">
        <div className="min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  )
}
