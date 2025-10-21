'use client'

import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Logo Area */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-6">
            <span className="text-white text-3xl font-bold">🎤</span>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Voice Bot</h1>
          <p className="text-xl text-gray-600">Chat with AI using your voice</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="text-2xl mb-3">🗣️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Speak Naturally</h3>
            <p className="text-gray-600 text-sm">Have natural conversations with advanced AI</p>
          </div>
          <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="font-semibold text-gray-900 mb-2">Real-Time</h3>
            <p className="text-gray-600 text-sm">Instant responses with low latency</p>
          </div>
          <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="text-2xl mb-3">🔒</div>
            <h3 className="font-semibold text-gray-900 mb-2">Private</h3>
            <p className="text-gray-600 text-sm">Your conversations are secure</p>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Link
            href="/voice"
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-secondary text-white font-semibold rounded-lg transition-colors text-lg"
          >
            🎯 Start Conversation
          </Link>
          <p className="text-gray-500 text-sm mt-4">Click above to begin voice chat</p>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>Powered by LiveKit • Real-time voice AI</p>
        </div>
      </div>
    </div>
  )
}
