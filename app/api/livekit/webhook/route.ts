import { NextRequest, NextResponse } from 'next/server'
import { WebhookReceiver, AgentDispatchClient } from 'livekit-server-sdk'

export const runtime = 'nodejs'

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY || '',
  process.env.LIVEKIT_API_SECRET || ''
)

async function dispatchAgentToRoom(roomName: string): Promise<boolean> {
  const startTime = Date.now()
  console.info(`[DISPATCH_START] roomName=${roomName} timestamp=${startTime}`)

  try {
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const liveKitUrl = process.env.LIVEKIT_URL

    if (!apiKey || !apiSecret || !liveKitUrl) {
      console.error('[DISPATCH_FAILED] Missing LiveKit credentials - apiKey exists: ' + !!apiKey + ', apiSecret exists: ' + !!apiSecret + ', liveKitUrl exists: ' + !!liveKitUrl)
      return false
    }

    console.info(`[DISPATCH_CREDENTIALS_OK] liveKitUrl=${liveKitUrl}`)

    // Initialize LiveKit AgentDispatchClient
    const dispatchClient = new AgentDispatchClient(liveKitUrl, apiKey, apiSecret)
    console.info(`[DISPATCH_CLIENT_CREATED] roomName=${roomName}`)

    // Create a dispatch for the agent to join the room
    // The agent name must match the Agent class name: 'Assistant'
    console.info(`[DISPATCH_CALLING_API] roomName=${roomName} agentName=Assistant`)
    const dispatch = await dispatchClient.createDispatch(roomName, 'Assistant')

    const duration = Date.now() - startTime
    console.info(`[DISPATCH_SUCCESS] roomName=${roomName} dispatchId=${dispatch.id} duration_ms=${duration} status=success`)

    return true
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[DISPATCH_FAILED] roomName=${roomName} duration_ms=${duration} error=${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    try {
      const event = await receiver.receive(body, request.headers.get('Authorization') || '')

      console.info('[Webhook] Event received and verified:', {
        event: event.event,
        room: (event as any).room?.name,
      })

      if (event.event === 'participant_joined') {
        const roomName = (event as any).room?.name
        const participant = (event as any).participant

        console.info(`[WEBHOOK_PARTICIPANT_JOINED] room=${roomName} participant=${participant?.identity}`)
        // Agent auto-dispatch is now embedded in token, no dispatch call needed here
      }

      return NextResponse.json(
        { status: 'ok', message: 'Webhook processed' },
        { status: 200 }
      )
    } catch (verifyError) {
      console.warn('[Webhook] Signature verification failed')

      const webhookData = JSON.parse(body)

      if (webhookData.event === 'participant_joined') {
        const roomName = webhookData.room?.name

        console.info(`[WEBHOOK_PARTICIPANT_JOINED_DEVMODE] room=${roomName} participant=${webhookData.participant?.identity}`)
        // Agent auto-dispatch is now embedded in token, no dispatch call needed here
      }

      return NextResponse.json(
        { status: 'ok', message: 'Webhook processed (dev mode)' },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)
    return NextResponse.json(
      { status: 'error', message: 'Error processing webhook' },
      { status: 200 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      status: 'ok',
      message: 'LiveKit webhook endpoint is ready',
      configured: {
        hasApiKey: !!process.env.LIVEKIT_API_KEY,
        hasApiSecret: !!process.env.LIVEKIT_API_SECRET,
        hasUrl: !!process.env.LIVEKIT_URL,
      },
    },
    { status: 200 }
  )
}
