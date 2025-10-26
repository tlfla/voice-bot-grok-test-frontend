'use client'

import VoiceBotInterface from '@/components/voice-bot-interface'

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-form-gold-muted rounded-full mb-4">
            <span className="text-white text-3xl font-bold">🎤</span>
          </div>
          <h1 className="text-5xl font-bold text-form-black mb-2">Empower AI</h1>
          <p className="text-2xl text-form-gold-muted font-semibold mb-1">Real Estate Coach</p>
          <p className="text-lg text-form-text-gray">Role Play and Practice</p>
        </div>

        {/* Voice Bot Interface */}
        <div className="bg-form-white rounded-lg shadow-lg p-8">
          <VoiceBotInterface />
        </div>
      </div>
    </div>
  )
}
