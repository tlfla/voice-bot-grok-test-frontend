'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Room, RoomEvent, Track, RemoteParticipant } from 'livekit-client'
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react'
import TrainingRecommendations from './training-recommendations'
import jsPDF from 'jspdf';

// Debug flag for diagnostics (set window.__CALL_DEBUG__ = true in console to enable)
declare global {
  interface Window {
    __CALL_DEBUG__?: boolean
    __EVAL_DEBUG__?: boolean
  }
}

// Safe disconnect helper with optional trace
function safeDisconnect(room: Room, reason: string): Promise<void> {
  if (!window.__CALL_DEBUG__) return room.disconnect()
  console.warn('[DISCONNECT_CALLED]', reason)
  console.trace()
  return room.disconnect()
}

// Initialize debug flags
if (typeof window !== 'undefined') {
  if (window.__CALL_DEBUG__ === undefined) window.__CALL_DEBUG__ = false
  if (window.__EVAL_DEBUG__ === undefined) window.__EVAL_DEBUG__ = false
}

// Evaluation result type
interface TrainingRecommendation {
  course: string
  module: string
  topic: string
  url: string
  section_note: string
  reason: string
}

interface TopWin {
  title: string
  description?: string
  citation?: string
}

interface TopImprovement {
  title: string
  description?: string
  what_you_said?: string
  suggested_alternative?: string
  impact?: string
}

interface SummaryObject {
  strengths?: string
  growth_areas?: string
  next_practice_focus?: string
}

interface EvaluationResult {
  overall_score?: number
  scores?: {
    rapport_building: number
    objection_handling: number
    tone_confidence: number
  }
  core_metrics?: Record<string, any>
  advanced_metrics?: Record<string, any>
  top_wins?: (string | TopWin)[]  // Support both string and object formats
  top_improvements?: (string | TopImprovement)[]  // Support both string and object formats
  training_links?: string[]  // Legacy support
  training_recommendations?: TrainingRecommendation[]  // New format with URLs
  summary?: string | SummaryObject  // Support both string and object formats
  error?: string
  scenario_type?: string; // Added for PDF report
}

export default function VoiceBotInterface() {
  const [room, setRoom] = useState<Room | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'processing'>('disconnected')
  const [isMuted, setIsMuted] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [evaluationEnabled, setEvaluationEnabled] = useState(false)
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [evalDone, setEvalDone] = useState(false)

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const dataChannelHandlerRef = useRef<((payload: Uint8Array, participant?: any) => void) | null>(null)

  const initializeRoom = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')

      // Clear previous evaluation state for new call
      setEvaluationResult(null)
      setIsEvaluating(false)
      setShowSummary(false)
      setEvalDone(false)

      const participantName = `user-${Date.now()}`
      // Generate UNIQUE room name for EACH conversation (not reused across sessions)
      const roomName = `room-test-roleplay-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Create AudioContext (wrapped in try-catch for iOS compatibility)
      try {
        const newAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioContextRef.current = newAudioContext
      } catch (err) {
        console.warn('[iOS] Failed to create AudioContext, continuing anyway:', err)
      }

      // Pre-create audio element during user click for iOS Safari compatibility
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.controls = false
      audioEl.muted = false
      audioEl.volume = 1.0
      audioEl.setAttribute('playsinline', 'true')  // Required for iPhone Safari
      document.body.appendChild(audioEl)
      remoteAudioRef.current = audioEl

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
        setConnectionStatus('connected')
        setIsLoading(false)
      })

      newRoom.on(RoomEvent.Disconnected, () => {
        setConnectionStatus('disconnected')
      })

      newRoom.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          // Use pre-created audio element (created during button click for iOS compatibility)
          const audioEl = remoteAudioRef.current
          if (!audioEl) {
            console.error('Audio element not found')
            return
          }

          try {
            track.attach(audioEl)

            // Resume audio context if suspended (non-blocking for iOS)
            if (audioContextRef.current?.state === 'suspended') {
              audioContextRef.current.resume().catch(err => {
                console.warn('[iOS] AudioContext resume failed:', err)
              })
            }

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

      // Data channel listener - stored in ref to prevent re-creation on re-renders
      if (!dataChannelHandlerRef.current) {
        dataChannelHandlerRef.current = (payload: Uint8Array, participant?: any) => {
          try {
            const text = new TextDecoder().decode(payload)
            const message = JSON.parse(text)

            if (message.type === 'ping') {
              if (window.__EVAL_DEBUG__) {
                console.log('[DATA] ping from', participant?.identity || 'unknown')
              }
            }

            if (message.type === 'evaluation_ready') {
              if (window.__EVAL_DEBUG__) {
                console.log('[EVALUATION_JSON]', JSON.stringify(message.data, null, 2))
              }
              setIsEvaluating(false)
              setEvaluationResult(message.data)
              setShowSummary(true)
              setEvalDone(true)
              console.log('[EVALUATION_RECEIVED]', message.data)
            }
          } catch (err) {
            console.warn('Error parsing data message:', err)
          }
        }
      }
      newRoom.on(RoomEvent.DataReceived, dataChannelHandlerRef.current)

      await newRoom.connect(url, token)
      setRoom(newRoom)

      await newRoom.startAudio()

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      try {
        await newRoom.localParticipant.setMicrophoneEnabled(true, undefined, {
          audioPreset: { maxBitrate: 32000 },
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
      setError(error instanceof Error ? error.message : 'Failed to connect')
      setIsLoading(false)
    }
  }, [evaluationEnabled])

  const disconnect = useCallback(async () => {
    if (room) {
      // Mute microphone immediately for UX
      try {
        await room.localParticipant.setMicrophoneEnabled(false)
      } catch (err) {
        console.warn('Error disabling microphone:', err)
      }

      // Stop playing agent audio immediately for UX
      if (remoteAudioRef.current) {
        try {
          remoteAudioRef.current.pause()
          remoteAudioRef.current.volume = 0
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
        setConnectionStatus('processing')  // Change to yellow during processing

        try {
          console.log('[REQUESTING_EVALUATION]')
          const requestMessage = JSON.stringify({ type: 'request_evaluation' })
          await room.localParticipant.publishData(
            new TextEncoder().encode(requestMessage),
            { reliable: true }
          )

          // NON-BLOCKING grace window using Promise.race (45 seconds)
          // Comprehensive evaluation takes 30-40 seconds for longer calls (gpt-4o-mini + detailed prompt + training mapping)
          const graceWindowMs = 45000

          const evaluationReceived = new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (evalDone) {
                clearInterval(checkInterval)
                resolve()
              }
            }, 100)

            // Cleanup interval after grace window
            setTimeout(() => clearInterval(checkInterval), graceWindowMs)
          })

          const timeout = new Promise<void>((resolve) => {
            setTimeout(resolve, graceWindowMs)
          })

          await Promise.race([evaluationReceived, timeout])

          if (!evalDone) {
            setIsEvaluating(false)
            console.warn('[EVALUATION_TIMEOUT] No result received after 45 seconds')
          }
        } catch (err) {
          console.warn('Error requesting evaluation:', err)
          setIsEvaluating(false)
        }
      }

      // Now disconnect - cleanup audio elements
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

      // Disconnect from room
      await safeDisconnect(room, 'EXPLICIT_HANGUP')
      setRoom(null)

      // Set to disconnected after evaluation complete
      setConnectionStatus('disconnected')
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

  const downloadPDF = useCallback(() => {
    if (!evaluationResult) return;

    const doc = new jsPDF('p', 'mm', 'letter');
    let yPos = 20;

    // Title
    doc.setFontSize(16);
    doc.text('Roleplay Evaluation Report', 20, yPos);
    yPos += 10;

    // Scenario and Overall Score
    doc.setFontSize(12);
    doc.text(`Scenario: ${evaluationResult.scenario_type || 'N/A'}`, 20, yPos);
    yPos += 7;
    doc.text(`Overall Score: ${evaluationResult.overall_score || 'N/A'}/10`, 20, yPos);
    yPos += 10;

    // Core Metrics
    doc.text('Core Metrics:', 20, yPos);
    yPos += 7;
    Object.entries(evaluationResult.core_metrics || {}).forEach(([key, metric]) => {
      doc.text(`${key.replace(/_/g, ' ').toUpperCase()}: ${metric.score}`, 25, yPos);
      doc.text(metric.feedback, 25, yPos + 5);
      yPos += 12;
    });

    // Top Wins
    doc.text('Top Wins:', 20, yPos);
    yPos += 7;
    (evaluationResult.top_wins || []).forEach(win => {
      if (typeof win === 'string') {
        doc.text(win, 25, yPos);
        yPos += 7;
      } else {
        doc.text(win.title, 25, yPos);
        doc.text(win.description, 25, yPos + 5);
        if (win.citation) doc.text(`Citation: ${win.citation}`, 25, yPos + 10);
        yPos += 15;
      }
    });

    // Top Improvements
    doc.text('Top Improvements:', 20, yPos);
    yPos += 7;
    (evaluationResult.top_improvements || []).forEach(imp => {
      if (typeof imp === 'string') {
        doc.text(imp, 25, yPos);
        yPos += 7;
      } else {
        doc.text(imp.title, 25, yPos);
        doc.text(imp.what_you_said, 25, yPos + 5);
        doc.text(`Suggested: ${imp.suggested_alternative}`, 25, yPos + 10);
        yPos += 15;
      }
    });

    // Training Recommendations
    doc.text('Training Recommendations:', 20, yPos);
    yPos += 7;
    (evaluationResult.training_recommendations || []).forEach(rec => {
      doc.text(`${rec.course} - ${rec.module}: ${rec.topic}`, 25, yPos);
      doc.text(rec.reason, 25, yPos + 5);
      doc.text(rec.url, 25, yPos + 10);
      yPos += 15;
    });

    // Summary
    doc.text('Summary:', 20, yPos);
    yPos += 7;
    if (evaluationResult.summary) {
      doc.text(evaluationResult.summary.strengths || '', 25, yPos);
      yPos += 7;
      doc.text(evaluationResult.summary.growth_areas || '', 25, yPos);
      yPos += 7;
      doc.text(evaluationResult.summary.next_practice_focus || '', 25, yPos);
    }

    doc.save('evaluation-report.pdf');
  }, [evaluationResult]);

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
            connectionStatus === 'connected' ? 'bg-form-success' : 
            connectionStatus === 'processing' ? 'bg-yellow-500' : 
            'bg-form-error'
          }`}
        />
        <span className="text-sm font-medium text-form-text-dark">
          {connectionStatus === 'connected' ? 'Connected' : 
           connectionStatus === 'processing' ? 'Analyzing Call...' : 
           'Disconnected'}
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

      {/* Evaluation Toggle */}
      {connectionStatus === 'disconnected' && (
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
        {connectionStatus === 'disconnected' ? (
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
                <div className="text-center text-form-text-gray py-6">
                  <div className="text-base mb-2">
                    <span className="animate-pulse">⏳</span> Analyzing your call performance...
                  </div>
                  <div className="text-xs text-form-text-gray">
                    This typically takes 30-45 seconds
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
                  {evaluationResult.overall_score && (
                    <div className="flex items-center justify-center">
                      <div className="bg-form-gold-muted text-white rounded-full w-16 h-16 flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold">{evaluationResult.overall_score.toFixed(1)}</div>
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
                        {evaluationResult.top_wins.map((win, idx) => (
                          <li key={idx} className="text-sm text-form-text-dark leading-relaxed pl-4 relative">
                            <span className="absolute left-0">•</span>
                            {typeof win === 'string' ? win : (
                              <div>
                                <strong>{win.title}</strong>
                                {win.description && <p className="text-xs mt-1">{win.description}</p>}
                              </div>
                            )}
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
                        {evaluationResult.top_improvements.map((improvement, idx) => (
                          <li key={idx} className="text-sm text-form-text-dark leading-relaxed pl-4 relative">
                            <span className="absolute left-0">•</span>
                            {typeof improvement === 'string' ? improvement : (
                              <div>
                                <strong>{improvement.title}</strong>
                                {improvement.description && <p className="text-xs mt-1">{improvement.description}</p>}
                                {improvement.what_you_said && (
                                  <p className="text-xs text-form-text-gray mt-1">
                                    <strong>You said:</strong> {improvement.what_you_said}
                                  </p>
                                )}
                                {improvement.suggested_alternative && (
                                  <p className="text-xs text-form-gold-muted mt-1">
                                    <strong>Try instead:</strong> {improvement.suggested_alternative}
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Training Recommendations - New Format with URLs */}
                  {evaluationResult.training_recommendations && evaluationResult.training_recommendations.length > 0 && (
                    <TrainingRecommendations recommendations={evaluationResult.training_recommendations} />
                  )}

                  {/* Training Links - Legacy Format (Fallback) */}
                  {!evaluationResult.training_recommendations && evaluationResult.training_links && evaluationResult.training_links.length > 0 && (
                    <div className="pt-3 border-t border-form-border-light space-y-2">
                      <h4 className="font-medium text-form-text-dark text-sm flex items-center gap-2">
                        📚 Recommended Training
                      </h4>
                      <ul className="space-y-1">
                        {evaluationResult.training_links.map((link, idx) => (
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
                      {typeof evaluationResult.summary === 'string' ? (
                        <p className="text-sm text-form-text-dark leading-relaxed">
                          {evaluationResult.summary}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {evaluationResult.summary.strengths && (
                            <div>
                              <strong className="text-xs text-form-text-dark">Strengths:</strong>
                              <p className="text-sm text-form-text-dark leading-relaxed mt-1">
                                {evaluationResult.summary.strengths}
                              </p>
                            </div>
                          )}
                          {evaluationResult.summary.growth_areas && (
                            <div>
                              <strong className="text-xs text-form-text-dark">Growth Areas:</strong>
                              <p className="text-sm text-form-text-dark leading-relaxed mt-1">
                                {evaluationResult.summary.growth_areas}
                              </p>
                            </div>
                          )}
                          {evaluationResult.summary.next_practice_focus && (
                            <div>
                              <strong className="text-xs text-form-text-dark">Next Practice Focus:</strong>
                              <p className="text-sm text-form-text-dark leading-relaxed mt-1">
                                {evaluationResult.summary.next_practice_focus}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
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

                  {/* Debug JSON Output */}
                  {typeof window !== 'undefined' && window.__EVAL_DEBUG__ && (
                    <div className="pt-3 border-t border-form-border-light">
                      <h4 className="font-medium text-form-text-dark text-sm mb-2">Debug Output</h4>
                      <pre className="text-xs bg-form-off-white p-3 rounded overflow-x-auto">
                        {JSON.stringify(evaluationResult, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {evaluationResult.error && (
                    <div className="text-sm text-form-error">
                      Error: {evaluationResult.error}
                    </div>
                  )}

                  {/* Download PDF Button */}
                  <div className="pt-3 border-t border-form-border-light">
                    <button
                      onClick={downloadPDF}
                      className="w-full px-4 py-2 bg-form-gold-muted hover:bg-form-gold-muted-dark text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Download PDF Report
                    </button>
                  </div>

                  {/* Fallback JSON download (Debug) */}
                  <div className="pt-3 border-t border-form-border-light">
                    <button
                      onClick={() => {
                        if (evaluationResult) {
                          const blob = new Blob([JSON.stringify(evaluationResult, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'evaluation.json';
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      }}
                      className="w-full px-4 py-2 bg-form-border-light hover:bg-form-text-gray text-form-text-dark text-sm font-medium rounded-lg transition-colors"
                    >
                      Download JSON (Debug)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
