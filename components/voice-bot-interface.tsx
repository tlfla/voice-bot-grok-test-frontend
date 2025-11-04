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
function safeDisconnect(room: Room, reason: string): Promise<void> {
  if (!window.__CALL_DEBUG__) return room.disconnect()
  console.warn('[DISCONNECT_CALLED]', reason)
  console.trace()
  return room.disconnect()
}

// Detect iOS Safari
function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const webkit = /WebKit/.test(ua)
  return iOS && webkit && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua)
}

// Get user-friendly microphone error message based on browser
function getMicrophoneErrorMessage(): string {
  if (typeof window === 'undefined') return 'Please make sure your microphone is enabled in your browser settings.'

  const ua = window.navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isEdge = /Edg/i.test(ua)
  const isChrome = /CriOS/i.test(ua) || (/Chrome/i.test(ua) && !/Edg/i.test(ua))
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|Edg/i.test(ua)
  const isFirefox = /FxiOS|Firefox/i.test(ua)

  if (isIOS) {
    if (isEdge) {
      return 'Microsoft Edge on iPhone has known audio issues. Please try using Safari or Chrome instead. If you want to use Edge, go to iPhone Settings → Edge → Microphone and enable access.'
    } else if (isChrome) {
      return 'Please make sure your microphone is enabled. Go to iPhone Settings → Chrome → Microphone and allow access.'
    } else if (isFirefox) {
      return 'Please make sure your microphone is enabled. Go to iPhone Settings → Firefox → Microphone and allow access.'
    } else if (isSafari) {
      return 'Please make sure your microphone is enabled. Go to iPhone Settings → Safari → Microphone and allow access.'
    } else {
      return 'Please make sure your microphone is enabled. Go to iPhone Settings → [Your Browser] → Microphone and allow access.'
    }
  } else {
    // Desktop browsers
    return 'Please make sure your microphone is enabled. Click the camera/microphone icon in your browser\'s address bar to allow access, then try again.'
  }
}

// Initialize debug flag
if (typeof window !== 'undefined' && window.__CALL_DEBUG__ === undefined) {
  window.__CALL_DEBUG__ = false
}

interface SessionConfig {
  llm: string
  systemPrompt: string
  cartesia: {
    model: string
    snapshot: string
    voice: string
    speed: number
    volume: number
    emotion: string | null
  }
  cadence: {
    max_sentences_per_turn: number
    end_with_question: boolean
  }
}

export default function VoiceBotInterface() {
  const [room, setRoom] = useState<Room | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [evaluationEnabled, setEvaluationEnabled] = useState(false)
  const [evaluationResult, setEvaluationResult] = useState<any>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [evalDone, setEvalDone] = useState(false)
  
  // Session-init configuration
  const [scenario, setScenario] = useState('listing_presentation')
  const [persona, setPersona] = useState('analytical')
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null)

  // Persistent audio element and context - created once, reused across sessions
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioUnlockHandshakeEnabled = useRef<boolean>(false)

  const initializeRoom = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')

      // Clear previous evaluation state for new call
      setEvaluationResult(null)
      setIsEvaluating(false)
      setShowSummary(false)
      setEvalDone(false)

      // STEP 0: Call session-init to get configuration
      console.log('[SESSION_INIT] Requesting config:', { scenario, persona })
      const sessionInitResponse = await fetch('/api/session-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, persona }),
      })

      if (!sessionInitResponse.ok) {
        throw new Error('Failed to initialize session configuration')
      }

      const config: SessionConfig = await sessionInitResponse.json()
      setSessionConfig(config)
      
      // Enhanced logging for debugging
      console.log('[SESSION_INIT] ✅ Config received:', {
        llm: config.llm,
        voice: config.cartesia.voice.substring(0, 8) + '...',
        speed: config.cartesia.speed,
        emotion: config.cartesia.emotion || 'null',
        promptLength: config.systemPrompt.length
      })
      console.log('[SESSION_INIT] System prompt preview:', config.systemPrompt.substring(0, 100) + '...')

      const participantName = `user-${Date.now()}`
      const roomName = `room-test-roleplay-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Feature flag: Enable handshake only on iOS Safari
      const isIOS = isIOSSafari()
      audioUnlockHandshakeEnabled.current = isIOS

      const timestamps: Record<string, number> = {}
      timestamps.unlock_started_at = Date.now()

      // STEP 1: Create persistent audio element if it doesn't exist
      if (!persistentAudioRef.current) {
        const audioEl = document.createElement('audio')
        audioEl.autoplay = true
        audioEl.controls = false
        audioEl.muted = false
        audioEl.volume = 1.0
        audioEl.setAttribute('playsinline', 'true')
        document.body.appendChild(audioEl)
        persistentAudioRef.current = audioEl
        console.log('[AUDIO_UNLOCK] Created persistent audio element')
      }

      // STEP 2: Create AudioContext if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        console.log('[AUDIO_UNLOCK] Created AudioContext')
      }

      // STEP 3: Play connection tone from persistent element + resume AudioContext
      let audioUnlockSuccess = false
      try {
        // Resume AudioContext first
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume()
          console.log('[AUDIO_UNLOCK] AudioContext resumed, state:', audioContextRef.current.state)
        }

        // Play connection tone from persistent element
        const connectionTone = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')
        connectionTone.volume = 0.2
        await connectionTone.play()

        audioUnlockSuccess = true
        timestamps.audio_unlocked_at = Date.now()
        console.log('[AUDIO_UNLOCK] Connection tone played successfully', {
          isIOS,
          handshakeEnabled: audioUnlockHandshakeEnabled.current,
          audioContextState: audioContextRef.current.state,
          unlockDuration: timestamps.audio_unlocked_at - timestamps.unlock_started_at
        })
      } catch (err) {
        console.error('[AUDIO_UNLOCK] Failed to unlock audio:', err)
        if (isIOS) {
          // On iOS, this is critical - show error
          setError('Please tap the screen to enable audio')
          setIsLoading(false)
          return
        }
      }

      // Get token with dynamic agent name and session config
      console.log('[TOKEN_REQUEST] Sending session_config to token route:', {
        participantName,
        agentName: 'roleplay-test',  // Must match backend agent name
        sessionConfigSize: JSON.stringify(config).length
      })
      
      const tokenResponse = await fetch('/api/voice-bot/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantName,
          roomName,
          agentName: 'roleplay-test',  // Must match backend agent name
          sessionConfig: config  // Pass session-init config to agent
        }),
      })
      
      console.log('[TOKEN_REQUEST] ✅ Token received, agent will use session config')

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token')
      }

      const { token, url } = await tokenResponse.json()

      const newRoom = new Room()

      newRoom.on(RoomEvent.Connected, async () => {
        setIsConnected(true)
        setIsLoading(false)
        timestamps.connected_at = Date.now()
        
        // Confirm session config was applied
        console.log('[CONNECTED] ✅ Session config applied. Agent should log: "Using session config system prompt"')

        // STEP 4: Send client_audio_ready signal if handshake is enabled
        if (audioUnlockHandshakeEnabled.current && audioUnlockSuccess) {
          try {
            await newRoom.localParticipant.publishData(
              new TextEncoder().encode(JSON.stringify({
                type: 'client_audio_ready',
                timestamp: timestamps.audio_unlocked_at,
                isIOS
              })),
              { reliable: true }
            )
            timestamps.client_audio_ready_sent_at = Date.now()
            console.log('[AUDIO_UNLOCK] Sent client_audio_ready signal', {
              sentAt: timestamps.client_audio_ready_sent_at,
              latencyMs: timestamps.client_audio_ready_sent_at - timestamps.connected_at
            })
          } catch (err) {
            console.error('[AUDIO_UNLOCK] Failed to send client_audio_ready:', err)
          }
        }
      })

      newRoom.on(RoomEvent.Disconnected, () => {
        setIsConnected(false)
      })

      newRoom.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          timestamps.track_received_at = Date.now()

          // STEP 5: Reuse persistent audio element
          const audioEl = persistentAudioRef.current
          if (!audioEl) {
            console.error('[AUDIO_UNLOCK] Persistent audio element not found')
            return
          }

          try {
            // Reset audio element for new call (in case it was muted from previous disconnect)
            audioEl.volume = 1
            track.attach(audioEl)
            const playResult = await audioEl.play()
            timestamps.first_play_at = Date.now()

            console.log('[AUDIO_UNLOCK] Track attached and playing', {
              participant: participant.identity,
              trackReceived: timestamps.track_received_at,
              firstPlay: timestamps.first_play_at,
              playLatency: timestamps.first_play_at - timestamps.track_received_at,
              totalLatency: timestamps.first_play_at - timestamps.unlock_started_at,
              playResult
            })

            if (participant.identity.includes('agent')) {
              if (window.__CALL_DEBUG__) console.log('[READY_FOR_USER]')
              setIsAgentSpeaking(true)
            }
          } catch (err) {
            console.error('[AUDIO_UNLOCK] Audio playback error:', err)
          }
        }
      })

      newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        try {
          const el = persistentAudioRef.current
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

      newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const decoder = new TextDecoder()
          const text = decoder.decode(payload)
          const data = JSON.parse(text)

          if (data.type === 'evaluation_result') {
            console.log('[EVALUATION] Received evaluation results:', data)
            console.log('[EVALUATION] data.data:', data.data)
            console.log('[EVALUATION] data.data type:', typeof data.data)
            console.log('[EVALUATION] data.data.overall_score:', data.data?.overall_score)
            setIsEvaluating(false)
            setEvalDone(true)
            // Set evaluation result (even if it contains an error)
            const resultData = data.data || data
            console.log('[EVALUATION] Setting evaluationResult to:', resultData)
            setEvaluationResult(resultData)
            setShowSummary(true)
          }
        } catch (err) {
          console.error('[DATA_CHANNEL] Error parsing data:', err)
        }
      })

      await newRoom.connect(url, token)
      setRoom(newRoom)

      await newRoom.startAudio()

      try {
        await newRoom.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: { maxBitrate: 28000 },
          dtx: true,
          red: true
        })
      } catch (err) {
        console.warn('Failed to enable microphone:', err)
      }

      // Send evaluate flag to backend
      const evaluateMessage = JSON.stringify({ type: 'evaluate', value: evaluationEnabled })
      await newRoom.localParticipant.publishData(
        new TextEncoder().encode(evaluateMessage),
        { reliable: true }
      )
      console.log('[EVALUATE_FLAG_SENT]', evaluationEnabled)
    } catch (error) {
      console.error('Error initializing room:', error)
      // Use browser-specific friendly error message
      setError(getMicrophoneErrorMessage())
      setIsLoading(false)
    }
  }, [evaluationEnabled, scenario, persona])

  const disconnect = useCallback(async () => {
    if (room) {
      // Mute microphone immediately for UX
      try {
        await room.localParticipant.setMicrophoneEnabled(false)
      } catch (err) {
        console.warn('Error disabling microphone:', err)
      }

      // Stop playing agent audio immediately for UX
      if (persistentAudioRef.current) {
        try {
          persistentAudioRef.current.pause()
          persistentAudioRef.current.volume = 0
        } catch (err) {
          console.warn('Error pausing audio:', err)
        }
      }

      // Hide "Agent speaking..." indicator immediately
      setIsAgentSpeaking(false)

      // If evaluation enabled, request it and wait with grace window
      if (evaluationEnabled && !evaluationResult) {
        setIsEvaluating(true)
        setEvalDone(false)

        try {
          console.log('[REQUESTING_EVALUATION]')
          const requestMessage = JSON.stringify({ type: 'request_evaluation' })
          await room.localParticipant.publishData(
            new TextEncoder().encode(requestMessage),
            { reliable: true }
          )

          // NON-BLOCKING grace window using Promise.race (10 seconds)
          const graceWindowMs = 10000

          const evaluationReceived = new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (evalDone) {
                clearInterval(checkInterval)
                resolve()
              }
            }, 100)

            setTimeout(() => clearInterval(checkInterval), graceWindowMs)
          })

          const timeout = new Promise<void>((resolve) => {
            setTimeout(resolve, graceWindowMs)
          })

          await Promise.race([evaluationReceived, timeout])

          if (!evalDone) {
            setIsEvaluating(false)
            console.warn('[EVALUATION_TIMEOUT] No result received after 10 seconds')
          }
        } catch (err) {
          console.warn('Error requesting evaluation:', err)
          setIsEvaluating(false)
        }
      }

      // Disconnect from room
      await safeDisconnect(room, 'EXPLICIT_HANGUP')
      setRoom(null)
      setIsConnected(false)
    }
  }, [room, evaluationEnabled, evaluationResult, evalDone])

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

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      if (persistentAudioRef.current && persistentAudioRef.current.parentNode) {
        try {
          persistentAudioRef.current.parentNode.removeChild(persistentAudioRef.current)
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

      {/* Scenario & Persona Selectors */}
      {!isConnected && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scenario Selector */}
            <div>
              <label htmlFor="scenario-select" className="block text-sm font-medium text-form-text-dark mb-2">
                Scenario
              </label>
              <select
                id="scenario-select"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="w-full px-3 py-2 border border-form-border-light rounded-lg text-form-text-dark focus:ring-2 focus:ring-form-gold-muted focus:border-transparent"
              >
                <option value="listing_presentation">Listing Presentation</option>
                <option value="price_reduction">Price Reduction</option>
                <option value="fsbo">For-Sale-By-Owner (FSBO)</option>
                <option value="expired">Expired Listing</option>
                <option value="buyer_prequal">Buyer Pre-Qualification</option>
                <option value="investor_dialogue">Investor Dialogue</option>
                <option value="referral_sphere">Referral / Sphere</option>
                <option value="general_objections">Objection Handling</option>
              </select>
            </div>

            {/* Persona Selector */}
            <div>
              <label htmlFor="persona-select" className="block text-sm font-medium text-form-text-dark mb-2">
                Client Persona
              </label>
              <select
                id="persona-select"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="w-full px-3 py-2 border border-form-border-light rounded-lg text-form-text-dark focus:ring-2 focus:ring-form-gold-muted focus:border-transparent"
              >
                <option value="analytical">Analytical / Cautious</option>
                <option value="expressive">Expressive / Enthusiastic</option>
                <option value="amiable">Amiable / Cooperative</option>
                <option value="driver">Driver / Confrontational</option>
                <option value="indecisive">Indecisive / Uncertain</option>
                <option value="skeptical">Skeptical / Distrustful</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Config Preview (Dev Tool) */}
      {!isConnected && sessionConfig && (
        <div className="bg-form-off-white border border-form-border-light rounded-lg p-4">
          <h4 className="font-medium text-form-text-dark mb-2 text-sm">✅ Session Config Ready</h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-form-text-gray">
            <div>
              <span className="font-medium">LLM:</span> {sessionConfig.llm}
            </div>
            <div>
              <span className="font-medium">Voice:</span> {sessionConfig.cartesia.voice.substring(0, 8)}...
            </div>
            <div>
              <span className="font-medium">Speed:</span> {sessionConfig.cartesia.speed}x
            </div>
            <div>
              <span className="font-medium">Emotion:</span> {sessionConfig.cartesia.emotion || 'none'}
            </div>
            <div className="col-span-2">
              <span className="font-medium">Prompt:</span> {sessionConfig.systemPrompt.length} chars
            </div>
          </div>
        </div>
      )}

      {/* Evaluation Toggle */}
      {!isConnected && (
        <div className="flex items-center justify-center gap-2">
          <input
            type="checkbox"
            id="evaluation-toggle"
            checked={evaluationEnabled}
            onChange={(e) => setEvaluationEnabled(e.target.checked)}
            className="w-4 h-4 text-form-gold-muted border-form-border-light rounded focus:ring-form-gold-muted"
          />
          <label htmlFor="evaluation-toggle" className="text-sm text-form-text-dark cursor-pointer">
            AI summary after call
          </label>
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
              disabled={isEvaluating}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isMuted
                  ? 'bg-form-error hover:bg-form-error text-white'
                  : 'bg-form-border-light hover:bg-form-text-gray text-form-text-dark'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={disconnect}
              disabled={isEvaluating}
              className="flex items-center gap-2 px-4 py-2 bg-form-error hover:bg-form-error text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PhoneOff className="w-4 h-4" />
              {isEvaluating ? 'Processing Summary...' : 'End Call'}
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

      {/* Call Summary Card */}
      {(evaluationEnabled || evaluationResult || isEvaluating) && (
        <div className="bg-white border border-form-border-light rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-form-off-white transition-colors"
          >
            <span className="font-medium text-form-text-dark flex items-center gap-2">
              📊 Call Summary
              {isEvaluating && (
                <span className="text-xs text-form-text-gray">(Preparing summary...)</span>
              )}
            </span>
            <span className="text-form-text-gray">
              {showSummary ? '▼' : '▶'}
            </span>
          </button>

          {showSummary && (
            <div className="px-4 py-3 border-t border-form-border-light">
              {isEvaluating && !evaluationResult && (
                <div className="text-center text-form-text-gray text-sm py-4">
                  <div className="animate-pulse">
                    Processing summary...
                  </div>
                </div>
              )}

              {evaluationResult && (
                <div className="space-y-4">
                  {/* No Transcript Error */}
                  {evaluationResult.error === 'no_transcript' && (
                    <div className="text-sm text-form-text-gray text-center py-4">
                      We didn't capture speech this time. Check mic permissions and try again.
                    </div>
                  )}

                  {/* Overall Score Badge */}
                  {evaluationResult.overall_score != null && !isNaN(Number(evaluationResult.overall_score)) && (
                    <div className="flex items-center justify-center">
                      <div className="bg-form-gold-muted text-white rounded-full w-16 h-16 flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold">{Number(evaluationResult.overall_score).toFixed(1)}</div>
                        <div className="text-xs">/ 10</div>
                      </div>
                    </div>
                  )}

                  {/* Core Scores */}
                  {evaluationResult.scores && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-form-text-dark text-sm">Core Metrics</h4>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-form-text-dark">Rapport Building</span>
                        <span className="font-medium text-form-gold-muted">
                          {evaluationResult.scores.rapport_building}/10
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-form-text-dark">Objection Handling</span>
                        <span className="font-medium text-form-gold-muted">
                          {evaluationResult.scores.objection_handling}/10
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-form-text-dark">Tone & Confidence</span>
                        <span className="font-medium text-form-gold-muted">
                          {evaluationResult.scores.tone_confidence}/10
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Top Wins */}
                  {evaluationResult.top_wins && evaluationResult.top_wins.length > 0 && (
                    <div className="pt-3 border-t border-form-border-light space-y-2">
                      <h4 className="font-medium text-form-text-dark text-sm flex items-center gap-2">
                        ✅ What You Did Well
                      </h4>
                      <ul className="space-y-1">
                        {evaluationResult.top_wins.map((win: string, idx: number) => (
                          <li key={idx} className="text-sm text-form-text-dark leading-relaxed pl-4 relative">
                            <span className="absolute left-0">•</span>
                            {win}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Top Improvements */}
                  {evaluationResult.top_improvements && evaluationResult.top_improvements.length > 0 && (
                    <div className="pt-3 border-t border-form-border-light space-y-2">
                      <h4 className="font-medium text-form-text-dark text-sm flex items-center gap-2">
                        🎯 Focus Areas for Next Call
                      </h4>
                      <ul className="space-y-1">
                        {evaluationResult.top_improvements.map((improvement: string, idx: number) => (
                          <li key={idx} className="text-sm text-form-text-dark leading-relaxed pl-4 relative">
                            <span className="absolute left-0">•</span>
                            {improvement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Training Links */}
                  {evaluationResult.training_links && evaluationResult.training_links.length > 0 && (
                    <div className="pt-3 border-t border-form-border-light space-y-2">
                      <h4 className="font-medium text-form-text-dark text-sm flex items-center gap-2">
                        📚 Recommended Training
                      </h4>
                      <ul className="space-y-1">
                        {evaluationResult.training_links.map((link: string, idx: number) => (
                          <li key={idx} className="text-sm text-form-gold-muted leading-relaxed pl-4 relative hover:underline">
                            <span className="absolute left-0">•</span>
                            {link}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Summary */}
                  {evaluationResult.summary && (
                    <div className="pt-3 border-t border-form-border-light">
                      <h4 className="font-medium text-form-text-dark text-sm mb-2">Summary</h4>
                      <p className="text-sm text-form-text-dark leading-relaxed">
                        {evaluationResult.summary}
                      </p>
                    </div>
                  )}

                  {/* Download JSON Button */}
                  <div className="pt-3 border-t border-form-border-light">
                    <button
                      onClick={() => {
                        const dataStr = JSON.stringify(evaluationResult, null, 2)
                        const dataBlob = new Blob([dataStr], { type: 'application/json' })
                        const url = URL.createObjectURL(dataBlob)
                        const link = document.createElement('a')
                        link.href = url
                        link.download = `evaluation-${Date.now()}.json`
                        link.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="w-full px-4 py-2 bg-form-border-light hover:bg-form-text-gray text-form-text-dark text-sm font-medium rounded-lg transition-colors"
                    >
                      📥 Download JSON
                    </button>
                  </div>

                  {/* Error */}
                  {evaluationResult.error && evaluationResult.error !== 'no_transcript' && (
                    <div className="text-sm text-form-error">
                      Error: {evaluationResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
