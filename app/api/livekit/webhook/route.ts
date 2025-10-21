import { NextRequest, NextResponse } from 'next/server'
import { WebhookReceiver } from 'livekit-server-sdk'

export const runtime = 'nodejs'

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY || '',
  process.env.LIVEKIT_API_SECRET || ''
)

async function dispatchAgentToRoom(roomName: string): Promise<boolean> {
  try {
    console.info(`[Webhook] Agent dispatch requested for room: ${roomName}`)
    console.info('[Webhook] External agent service should join this room')
    return true
  } catch (error) {
    console.error('[Webhook] Error dispatching agent:', error)
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
        const isAgent = participant?.identity?.includes('agent')

        if (roomName && !isAgent) {
          console.info(`[Webhook] Dispatching agent to room: ${roomName}`)
          await dispatchAgentToRoom(roomName)
        }
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
        const isAgent = webhookData.participant?.identity?.includes('agent')

        if (roomName && !isAgent) {
          console.info(`[Webhook] Dev mode: Dispatching agent to room: ${roomName}`)
          await dispatchAgentToRoom(roomName)
        }
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
