# Real Estate Voice Coach - Frontend (Current Live Cerebras)

Production Next.js web interface for real estate roleplay coaching with AI, deployed on Vercel.

**Repository**: `tlfla/voice-bot-separate`  
**Branch**: `voice-2-enhancement`  
**Deployment**: Vercel (auto-deploy from GitHub)  
**Live URL**: `voice-bot-separate-git-voice-2-enhancement-tlflas-projects.vercel.app`

---

## Architecture

### Core Stack
- **Framework**: Next.js 14 (App Router)
- **UI**: React + TypeScript
- **Styling**: Tailwind CSS (custom gold/green theme)
- **Voice**: LiveKit React SDK
- **Hosting**: Vercel with automatic deployments

### Integration
- **Backend**: Railway-hosted Python agent (`roleplay-test`)
- **LiveKit**: WebRTC for real-time voice streaming
- **Token Generation**: Next.js API routes (`/api/voice-bot/token`)
- **Webhooks**: LiveKit webhook handler (`/api/livekit/webhook`)

---

## Key Features

### 1. Voice Interface
- One-click connect to voice AI
- Real-time audio streaming via WebRTC
- Visual feedback (waveform, connection status)
- Mobile-responsive design

### 2. AI Evaluation
- Post-call analysis button
- Detailed performance scores
- Training recommendations
- Category-based feedback

### 3. Brand Styling
- Custom gold/green color scheme ("form-gold-muted")
- Empower AI branding
- Clean, professional UI
- Large touch-friendly buttons

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- pnpm package manager
- LiveKit Cloud account

### Installation

1. **Clone and enter directory**
   ```bash
   cd /Users/tl/Development/voice-bot-cerebras-clean/frontend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   
   Create `.env.local` with:
   ```bash
   # LiveKit Connection
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your-api-key
   LIVEKIT_API_SECRET=your-api-secret
   
   # Not actually used in this version, but may be in .env.example:
   # OPENAI_API_KEY=sk-xxxxxxxxxxxxx
   ```

4. **Run development server**
   ```bash
   pnpm dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## Deployment

### Vercel Configuration

**Environment Variables** (set in Vercel dashboard):
```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
```

**Build Settings**:
- Framework: Next.js
- Build Command: `pnpm build`
- Output Directory: `.next`
- Node Version: 18.x

**Deployment**:
- Automatic on push to `voice-2-enhancement` branch
- Preview URLs generated for each commit
- Production domain configured in Vercel

---

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx              # Main landing page
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   └── api/
│       ├── voice-bot/token/route.ts    # Token generation
│       └── livekit/webhook/route.ts    # Webhook handler
├── components/
│   ├── voice-bot-interface.tsx         # Main voice UI
│   └── training-recommendations.tsx    # Eval results display
├── tailwind.config.ts        # Theme configuration
├── next.config.ts            # Next.js config
└── package.json              # Dependencies
```

---

## How It Works

### Connection Flow

1. **User loads page** → UI displays "Connect" button
2. **User clicks Connect** → Request sent to `/api/voice-bot/token`
3. **Token generated** → Backend creates LiveKit room token
4. **LiveKit connects** → WebRTC session established
5. **Agent joins** → Backend worker picks up job
6. **Conversation starts** → User and AI exchange audio

### Evaluation Flow

1. **Conversation ends** → User clicks "Request Evaluation"
2. **Webhook called** → POST to backend evaluation endpoint
3. **Results received** → JSON with scores and recommendations
4. **UI updates** → Training recommendations displayed
5. **Categories shown** → Mapped to specific training areas

---

## Configuration Notes

### Agent Name
Frontend requests agent `roleplay-test` when creating LiveKit connection. This must match the backend agent configuration.

### Token Generation
`/api/voice-bot/token/route.ts` creates room tokens with:
- Room name: Auto-generated UUID
- Participant name: "User"
- Agent dispatch: `roleplay-test`

### Theme Colors
Defined in `tailwind.config.ts`:
- `form-gold-muted`: Primary brand color
- `form-black`: Text color
- `form-white`: Background
- `form-text-gray`: Secondary text

### Evaluation Display
`training-recommendations.tsx` component shows:
- Overall score (1-10)
- Category-specific feedback
- Training resource links
- Color-coded performance indicators

---

## API Routes

### POST `/api/voice-bot/token`
**Purpose**: Generate LiveKit room token for new connection

**Request**: None (creates new room)

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "url": "wss://your-project.livekit.cloud"
}
```

### POST `/api/livekit/webhook`
**Purpose**: Handle LiveKit events (room created, participant joined, etc.)

**Request**: LiveKit webhook payload (verified signature)

**Response**: 200 OK

---

## Customization

### Changing Agent Name
Update in `components/voice-bot-interface.tsx`:
```typescript
agent: { dispatch: 'roleplay-test' }  // Change to your agent name
```

### Updating Branding
Edit `app/page.tsx`:
```tsx
<h1>Empower AI</h1>           // Company name
<p>Real Estate Coach</p>      // Tagline
```

### Modifying Theme
Edit `tailwind.config.ts` to change colors, fonts, spacing.

### Evaluation Categories
Training mappings loaded from backend `data/training_mapping.json`. Frontend displays based on category keys.

---

## Troubleshooting

### "Failed to connect"
1. Check `LIVEKIT_URL` is correct (starts with `wss://`)
2. Verify API key/secret in environment variables
3. Ensure backend is running on Railway
4. Check browser console for WebRTC errors

### Agent Not Joining
1. Confirm agent name is `roleplay-test`
2. Check backend logs in Railway
3. Verify backend workers are running
4. Review LiveKit room status in dashboard

### Evaluation Not Working
1. Check backend evaluation endpoint is accessible
2. Verify transcript data is being collected
3. Review network tab for failed requests
4. Confirm evaluation webhook URL is correct

### Styling Issues
1. Clear `.next` build cache: `rm -rf .next`
2. Rebuild: `pnpm build`
3. Check Tailwind CSS purging in production
4. Verify custom colors in `tailwind.config.ts`

---

## Browser Compatibility

**Supported Browsers**:
- Chrome/Edge 90+
- Safari 15+
- Firefox 90+
- iOS Safari 15+
- Chrome Android 90+

**Requirements**:
- WebRTC support
- Microphone permissions
- HTTPS (required for getUserMedia)

---

## Security Notes

### Token Security
- Room tokens expire after session
- Each connection gets unique room
- API routes validate requests
- Webhook signatures verified

### Environment Variables
- Never commit `.env.local` to Git
- Use Vercel environment variables for production
- Rotate API keys if exposed

---

## Performance

### Optimizations
- Next.js automatic code splitting
- React Server Components where possible
- Lazy loading of evaluation UI
- Optimized Tailwind CSS bundle

### Monitoring
- Vercel Analytics (if enabled)
- Browser DevTools performance tab
- WebRTC stats via LiveKit SDK

---

## License

MIT License - See LICENSE file for details.
