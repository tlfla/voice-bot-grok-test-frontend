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
      // Generate UNIQUE room name for EACH conversation (not reused across sessions)
      const roomName = `room-test-roleplay-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Create fresh AudioContext for this session
      const newAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = newAudioContext
      console.log('[AUDIO_CONTEXT_CREATED] context_state=running')

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
        console.log('[ROOM_CONNECTED] Connected to room')
        setIsConnected(true)
        setIsLoading(false)
      })

      newRoom.on(RoomEvent.Disconnected, () => {
        console.log('[ROOM_DISCONNECTED] Disconnected from room')
        setIsConnected(false)
      })

      newRoom.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`[TRACK_SUBSCRIBED] participant=${participant.identity} track=${track.sid}`)

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
            console.log(`[AUDIO_ARMED]=true track_id=${track.sid}`)

            if (participant.identity.includes('agent')) {
              console.log('[AGENT_TRACK_BOUND] Agent audio bound and playing')
              setIsAgentSpeaking(true)
            }
          } catch (err) {
            console.warn('Audio playback error:', err)
          }
        }
      })

      newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log(`[TRACK_UNSUBSCRIBED] participant=${participant.identity}`)
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

      // iOS Safari: unlock audio playback with user gesture
      await newRoom.startAudio()
      console.log('[AUDIO_UNLOCKED] Audio context started for iOS Safari')

      // Resume audio context after user gesture
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log('[AUDIO_ARMED]=true context_state=resumed')
      }

      try {
        // Step 1: Prompt for mic permission (iOS Safari needs this separate)
        await newRoom.localParticipant.setMicrophoneEnabled(true)
        console.log('[MIC_PERMISSION] Microphone permission granted')

        // Step 2: Re-enable with publish options for bandwidth optimization
        await newRoom.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: { maxBitrate: 28000 },
          dtx: true
        })
        console.log('[MICROPHONE_ENABLED] Microphone enabled with 28kbps bitrate and DTX')
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
      // Remove audio element from DOM
      if (remoteAudioRef.current && remoteAudioRef.current.parentNode) {
        try {
          remoteAudioRef.current.parentNode.removeChild(remoteAudioRef.current)
        } catch (err) {
          console.warn('Error removing audio element:', err)
        }
        remoteAudioRef.current = null
      }

      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close()
        } catch (err) {
          console.warn('Error closing audio context:', err)
        }
        audioContextRef.current = null
      }

      await room.disconnect()
      setRoom(null)
      setIsConnected(false)
    }
  }, [room])

  const toggleMute = useCallback(async () => {
    if (room) {
      if (isMuted) {
        await room.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: { maxBitrate: 28000 },
          dtx: true
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (room) room.disconnect()
    }
  }, [room])

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
