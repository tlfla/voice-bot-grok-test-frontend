'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Room, RoomEvent, Track, RemoteParticipant } from 'livekit-client'
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react'

// Debug flag for diagnostics (set window.__CALL_DEBUG__ = true in console to enable)
declare global {
  interface Window {
    __CALL_DEBUG__?: boolean
  }
}

// Safe disconnect helper with optional trace
function safeDisconnect(room: Room): Promise<void> {
  if (!window.__CALL_DEBUG__) return room.disconnect()
  console.warn('[DISCONNECT_CALLED]')
  console.trace()
  return room.disconnect()
}

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
      // Generate UNIQUE room name for EACH conversation (not reused across sessions)
      const roomName = `room-test-roleplay-${Date.now()}-${Math.random().toString(36).substring(7)}`

      const newAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = newAudioContext

      // Get token with unique room name per conversation
      const tokenResponse = await fetch('/api/voice-bot/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName, roomName }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token')
      }

      const { token, url } = await tokenResponse.json()

      const newRoom = new Room()

      newRoom.on(RoomEvent.Connected, () => {
        setIsConnected(true)
        setIsLoading(false)
      })

      newRoom.on(RoomEvent.Disconnected, () => {
        setIsConnected(false)
      })

      newRoom.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          // Create fresh audio element for this track
          const audioEl = document.createElement('audio')
          audioEl.autoplay = true
          audioEl.controls = false
          audioEl.muted = false
          audioEl.volume = 1.0
          document.body.appendChild(audioEl)
          remoteAudioRef.current = audioEl

          try {
            track.attach(audioEl)
            await audioEl.play()

            if (participant.identity.includes('agent')) {
              if (window.__CALL_DEBUG__) console.log('[READY_FOR_USER]')
              setIsAgentSpeaking(true)
            }
          } catch (err) {
            console.warn('Audio playback error:', err)
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

      newRoom.on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication.kind === Track.Kind.Audio && window.__CALL_DEBUG__) {
          console.log('[MIC_SENDING]')
        }
      })

      await newRoom.connect(url, token)
      setRoom(newRoom)

      await newRoom.startAudio()

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      try {
        await newRoom.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: { maxBitrate: 28000 },
          dtx: true,
          red: true
        })
      } catch (err) {
        console.warn('Failed to enable microphone:', err)
      }
    } catch (error) {
      console.error('Error initializing room:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect')
      setIsLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (room) {
      if (remoteAudioRef.current && remoteAudioRef.current.parentNode) {
        try {
          remoteAudioRef.current.parentNode.removeChild(remoteAudioRef.current)
        } catch (err) {
          console.warn('Error removing audio element:', err)
        }
        remoteAudioRef.current = null
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close()
        } catch (err) {
          console.warn('Error closing audio context:', err)
        }
        audioContextRef.current = null
      }

      await safeDisconnect(room)
      setRoom(null)
      setIsConnected(false)
    }
  }, [room])

  const toggleMute = useCallback(async () => {
    if (room) {
      if (isMuted) {
        await room.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: { maxBitrate: 28000 },
          dtx: true,
          red: true
        })
        setIsMuted(false)
      } else {
        await room.localParticipant.setMicrophoneEnabled(false)
        setIsMuted(true)
      }
    }
  }, [room, isMuted])

  // Cleanup audio element on unmount only
  useEffect(() => {
    return () => {
      if (remoteAudioRef.current && remoteAudioRef.current.parentNode) {
        try {
          remoteAudioRef.current.parentNode.removeChild(remoteAudioRef.current)
        } catch (err) {
          console.warn('Error removing audio element:', err)
        }
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close()
        } catch (err) {
          console.warn('Error closing audio context:', err)
        }
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-form-success' : 'bg-form-error'
          }`}
        />
        <span className="text-sm font-medium text-form-text-dark">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {isAgentSpeaking && (
          <div className="flex items-center gap-2 text-form-gold-muted ml-4">
            <Volume2 className="w-4 h-4" />
            <span className="text-sm">Agent speaking...</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-form-error bg-opacity-10 border border-form-error text-form-error p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-4 flex-wrap">
        {!isConnected ? (
          <button
            onClick={initializeRoom}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-form-gold-muted hover:bg-form-gold-muted-dark text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Connecting...' : '🎤 Start Conversation'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isMuted
                  ? 'bg-form-error hover:bg-form-error text-white'
                  : 'bg-form-border-light hover:bg-form-text-gray text-form-text-dark'
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 px-4 py-2 bg-form-error hover:bg-form-error text-white font-medium rounded-lg transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-form-off-white border border-form-border-light rounded-lg p-4">
        <h4 className="font-medium text-form-text-dark mb-2">How to use:</h4>
        <ul className="text-sm text-form-text-dark space-y-1">
          <li>• Click "Start Conversation" to begin</li>
          <li>• Speak naturally - the AI will respond</li>
          <li>• Use the mute button if needed</li>
          <li>• Click "End Call" when finished</li>
        </ul>
      </div>
    </div>
  )
}
