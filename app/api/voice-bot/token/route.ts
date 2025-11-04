import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { participantName, roomName } = body

    if (!participantName) {
      return NextResponse.json(
        { error: 'participantName is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const livekitUrl = process.env.LIVEKIT_URL

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error('Missing LiveKit configuration')
      return NextResponse.json(
        { error: 'LiveKit configuration is missing' },
        { status: 500 }
      )
    }

    // Use provided room name or generate unique one per session
    // This prevents users from being forced into the same room
    const assignedRoom = roomName || `room-test-roleplay-${randomUUID()}`

    // Create access token for the participant
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
    })

    // Grant basic room permissions
    at.addGrant({
      roomJoin: true,
      room: assignedRoom,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    })

    // Configure agent auto-dispatch via roomConfig
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: 'roleplay-test',  // Must match backend agent name
          metadata: JSON.stringify({
            room: assignedRoom,
            participant: participantName,
          }),
        }),
      ],
    })

    const token = await at.toJwt()

    console.info(`[TOKEN_MINTED] room=${assignedRoom} agentName=roleplay participant=${participantName} status=success`)

    return NextResponse.json({
      token,
      url: livekitUrl,
    })
  } catch (error) {
    console.error('Error generating token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
