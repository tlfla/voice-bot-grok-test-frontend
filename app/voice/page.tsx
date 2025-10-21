'use client'

import { useRouter } from "next/navigation"
import VoiceBotInterface from "@/components/voice-bot-interface"

export default function VoicePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-gray-600 hover:text-gray-900 text-xl"
            >
              ←
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Voice Chat</h1>
          </div>
          <div className="text-sm text-gray-500">🎤 Active</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <VoiceBotInterface />
        </div>
      </div>
    </div>
  )
}
