'use client'

import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Logo Area */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-full mb-6">
            <span className="text-white text-3xl font-bold">🎤</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Empower AI</h1>
          <p className="text-2xl text-amber-500 font-semibold mb-2">Real Estate Coach</p>
          <p className="text-xl text-gray-300">Role Play and Practice</p>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Link
            href="/voice"
            className="inline-flex items-center gap-2 px-8 py-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors text-lg"
          >
            🎯 Start Conversation
          </Link>
          <p className="text-gray-400 text-sm mt-4">Click above to begin voice chat</p>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-700 text-center text-gray-400 text-sm">
          <p>Powered by LiveKit • Real-time voice AI</p>
        </div>
      </div>
    </div>
  )
}
