'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Room, RoomEvent, Track, RemoteParticipant } from 'livekit-client'
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react'

export default function VoiceBotInterface() {
  const [room, setRoom] = useState<Room | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const initializeRoom = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')

      const participantName = `user-${Date.now()}`

      // Get token
      const tokenResponse = await fetch('/api/voice-bot/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token')
      }

      const { token, url } = await tokenResponse.json()

      const newRoom = new Room()

      newRoom.on(RoomEvent.Connected, async () => {
        console.log('Connected to room')
        try {
          await newRoom.localParticipant.setMicrophoneEnabled(true)
          console.log('Microphone enabled')
        } catch (err) {
          console.warn('Failed to enable microphone:', err)
        }
        setIsConnected(true)
        setIsLoading(false)
      })

      newRoom.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room')
        setIsConnected(false)
      })

      newRoom.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = remoteAudioRef.current
          if (el) {
            try {
              track.attach(el)
              el.muted = false
              el.volume = 1.0
              await el.play()
              console.log('Audio playing')

              if (participant.identity.includes('agent')) {
                setIsAgentSpeaking(true)
              }
            } catch (err) {
              console.warn('Audio playback error:', err)
            }
          }
        }
      })

      newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        try {
          const el = remoteAudioRef.current
          if (el) track.detach(el)
        } catch (err) {
          console.warn('Error detaching track:', err)
        }

        if (participant.identity.includes('agent')) {
          setIsAgentSpeaking(false)
        }
      })

      await newRoom.connect(url, token)
      setRoom(newRoom)
    } catch (error) {
      console.error('Error initializing room:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect')
      setIsLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (room) {
      await room.disconnect()
      setRoom(null)
      setIsConnected(false)
    }
  }, [room])

  const toggleMute = useCallback(async () => {
    if (room) {
      if (isMuted) {
        await room.localParticipant.setMicrophoneEnabled(true)
        setIsMuted(false)
      } else {
        await room.localParticipant.setMicrophoneEnabled(false)
        setIsMuted(true)
      }
    }
  }, [room, isMuted])

  // Initialize audio element on mount
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.controls = false
      audioEl.muted = false
      audioEl.volume = 1.0
      document.body.appendChild(audioEl)
      remoteAudioRef.current = audioEl
    }
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (room) room.disconnect()
    }
  }, [room])

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
      {/* Status */}
      <div className="flex items-center justify-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="text-sm font-medium text-gray-600">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {isAgentSpeaking && (
          <div className="flex items-center gap-2 text-blue-600 ml-4">
            <Volume2 className="w-4 h-4" />
            <span className="text-sm">Agent speaking...</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-4 flex-wrap">
        {!isConnected ? (
          <button
            onClick={initializeRoom}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-secondary text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Connecting...' : '🎤 Start Conversation'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Click "Start Conversation" to begin</li>
          <li>• Speak naturally - the AI will respond</li>
          <li>• Use the mute button if needed</li>
          <li>• Click "End Call" when finished</li>
        </ul>
      </div>
    </div>
  )
}
