# Voice Bot Separate

Minimal Next.js voice chatbot with LiveKit integration.

## Setup

1. Copy `.env.example` to `.env.local` and add your credentials:
   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run development server:
   ```bash
   pnpm dev
   ```

4. Open http://localhost:3000

## Deployment to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Environment Variables Required

- `LIVEKIT_URL`: Your LiveKit cloud URL
- `LIVEKIT_API_KEY`: LiveKit API key
- `LIVEKIT_API_SECRET`: LiveKit API secret
- `OPENAI_API_KEY`: OpenAI API key (for the agent)

## Features

- 🎤 Voice chat interface
- ⚡ Real-time audio streaming
- 🔒 Secure WebRTC connections
- 📱 Mobile-friendly UI
- 🟢 Green theme branding
