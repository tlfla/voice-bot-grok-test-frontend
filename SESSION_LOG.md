# Voice Speed Test - Session Log

**Date**: November 4, 2025  
**Session Duration**: ~3 hours  
**Objective**: Fix voice delivery to match Cerebras demo quality (cerebras.livekit.io)

---

## Problem Statement

Business partner feedback: "Cerebras live demo has better sound - more pitchy voice, rapid talking, doesn't think as much. Our Sonic-3 version seems slower/flatter."

**Key Question**: Did our recent pivot to Sonic-3 cause issues? Should we revert to Sonic-2?

---

## Research Phase

### 1. Located Production Environment
- **Original messy location**: `/Users/tl/Development/empower-voice-2-enhancement/`
- **Created clean copy**: `/Users/tl/Development/voice-bot-cerebras-clean/`
- **Repos found**:
  - Backend: `tlfla/voice-bot-backend-private` (branch: `voice-2-enhancement`)
  - Frontend: `tlfla/voice-bot-separate` (branch: `voice-2-enhancement`)
- **Deployment**:
  - Railway: 2 services × 10 workers = 20 concurrent
  - Vercel: `voice-bot-separate-git-voice-2-enhancement-tlflas-projects.vercel.app`

### 2. Version History Investigation
- **Current version**: `livekit-agents~=1.2` (locked around 1.2.0-1.2.15)
- **Latest available**: 1.2.17 (released Oct 29, 2025)
- **Critical finding**: Oct 27-28 you tried `speed=1.04` on Sonic-3 → FAILED
- **Git commit 6b07410**: "URGENT FIX: Remove speed/emotion params - not supported in Sonic-3"
- **Timeline revelation**: Speed params were added to Sonic-3 support in versions 1.2.16-1.2.17 (days after you tried)

### 3. Root Cause Analysis

**Found TWO issues:**

**Issue #1 - Prompt Problem (SMOKING GUN):**
```
### Update: Relaxed pacing for Sonic-3 – smoother delivery, fewer pauses
```
This line in system prompt DIRECTLY instructed the LLM to be slower/calmer.

**Issue #2 - Missing Speed Parameter:**
- Sonic-3 NOW supports speed/emotion (as of 1.2.16+)
- We were running older plugin version that didn't expose these params
- Upgrade to 1.2.17 would enable speed control

### 4. Cartesia Documentation Findings
- April 2025: Cartesia deprecated speed/emotion as "unstable"
- October 2025: Sonic-3 re-introduced them as stable
- LiveKit plugin caught up in 1.2.16+
- Speed range: 0.6-1.5 (conservative: stay ≤1.5)

### 5. Comparison with Cerebras Demo
- Cerebras demo likely uses: Default LiveKit TTS OR Sonic-2/Turbo
- Probably NOT using Sonic-3 (based on AI's vague response)
- Demo feels snappier due to: Prompt tuning + connection optimizations

---

## Implementation Phase

### Created Test Infrastructure

**New Repositories (NEVER touch production):**
- Backend: `https://github.com/tlfla/voice-bot-backend-speed-test`
- Frontend: `https://github.com/tlfla/voice-bot-frontend-speed-test`

**Created Documentation:**
- `WHERE_WE_CAME_FROM.md` (both repos) - Explicit warning to never touch old repos
- `SESSION_LOG.md` (this file) - Complete change log

### Changes Made

#### Backend Changes:

1. **Fixed System Prompt** (`src/prompt/roleplay_system_prompt.txt`):
   ```diff
   - ### Update: Relaxed pacing for Sonic-3 – smoother delivery, fewer pauses
   + ### Delivery: Natural, conversational pacing with energy and personality
   ```

2. **Upgraded Dependencies**:
   - `livekit-agents`: ~1.2 → 1.2.17
   - `livekit-plugins-cartesia`: → 1.2.17
   - All related plugins upgraded

3. **Added Speed Parameter with Fallback** (`src/agent.py`):
   ```python
   try:
       tts_option = cartesia.TTS(
           voice="1242fb95-7ddd-44ac-8a05-9e8a22a6137d",  # Cindy
           model="sonic-3-2025-10-27",
           speed=1.12  # 12% faster for energetic delivery
       )
       logger.info("✅ Sonic-3 with speed=1.12")
   except TypeError as e:
       # Graceful fallback if plugin doesn't support speed
       logger.warning(f"⚠️ Speed parameter not supported: {e}")
       tts_option = cartesia.TTS(
           voice="1242fb95-7ddd-44ac-8a05-9e8a22a6137d",
           model="sonic-3-2025-10-27"
       )
   ```

4. **Cleaned Up Documentation**:
   - Removed old integration docs (CEREBRAS_INTEGRATION.md, etc.)
   - Updated README.md for test environment

#### Frontend Changes:

1. **Fixed Agent Name Mismatch** (`app/api/voice-bot/token/route.ts`):
   ```diff
   - agentName: 'roleplay',
   + agentName: 'roleplay-test',  // Must match backend
   ```

2. **Updated Documentation**:
   - Added `WHERE_WE_CAME_FROM.md`
   - Updated README.md

### Deployment Configuration

**Railway Service:**
- Name: `voice-bot-backend-speed-test`
- Repo: `tlfla/voice-bot-backend-speed-test`
- Branch: `main`
- Workers: 10 (default)
- Agent Name: `roleplay-test`

**Vercel Deployment:**
- URL: `https://voice-bot-frontend-speed-test.vercel.app/`
- Repo: `tlfla/voice-bot-frontend-speed-test`
- Branch: `main`

**Required Environment Variables (Vercel):**
```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

---

## Git Commits Made

### Backend (voice-bot-backend-speed-test):
1. `83770f8` - Fix prompt: Change from 'Relaxed pacing' to natural energetic delivery
2. `e4432af` - Add documentation and clean up old docs
3. `2256f5f` - Add speed=1.12 parameter with feature detection fallback

### Frontend (voice-bot-frontend-speed-test):
1. `8754153` - Add documentation - speed test fork from production
2. `4631c97` - Fix agent name: 'roleplay' → 'roleplay-test' to match backend

---

## NOT Done Yet (Pending)

### Immediate Next Steps:
1. ⏳ **User**: Add LiveKit env vars to Vercel
2. ⏳ **User**: Test voice quality on live site
3. ⏳ **Evaluate**: Does it sound better than before?

### If Testing Succeeds:
4. ⏳ **Optional**: Fine-tune speed (try 1.08, 1.10, 1.15)
5. ⏳ **Optional**: A/B test different Sonic-3 voices
6. ⏳ **Decision**: Merge back to production or keep testing?

### If Testing Fails:
4. ⏳ **Fallback Option A**: Try Sonic-2 with speed control (proven to work)
5. ⏳ **Fallback Option B**: Try Sonic-Turbo (40ms latency, fastest)
6. ⏳ **Fallback Option C**: Different voice on Sonic-3

---

## Key Decisions Made

### ✅ DO NOT touch production repos:
- ❌ `tlfla/voice-bot-backend-private`
- ❌ `tlfla/voice-bot-separate`
- These serve live clients via Railway/Vercel auto-deploy

### ✅ Use separate test infrastructure:
- Work in `voice-bot-backend-speed-test` / `voice-bot-frontend-speed-test`
- Safe to experiment without breaking production

### ✅ Upgrade to 1.2.17 (not revert to Sonic-2):
- Minor version upgrade (1.2.x → 1.2.17)
- No breaking changes
- Gets us speed parameter support
- Fallback code ensures graceful degradation

### ✅ Test prompt fix first:
- Biggest impact, zero risk
- Could solve 60-80% of problem alone

---

## Technical Notes

### Why Speed Parameter Failed Before:
- Oct 27-28: Tried on livekit-agents 1.2.0-1.2.15
- Those versions didn't expose speed/emotion params
- Oct 29: Versions 1.2.16-1.2.17 released with support
- We were literally days early

### Why Railway Service Name Doesn't Matter:
- Frontend doesn't connect directly to Railway
- Connection flow: Frontend → LiveKit Cloud → Railway workers
- LiveKit matches workers by `agentName` in code, not Railway service name
- Agent name `roleplay-test` is what matters

### Voice Pipeline Architecture:
```
User Browser
  ↓ WebRTC
LiveKit Cloud
  ↓ Job dispatch (agent: roleplay-test)
Railway Worker (any service name)
  ↓ STT: AssemblyAI
  ↓ LLM: Cerebras Llama 3.3 70B
  ↓ TTS: Cartesia Sonic-3 (speed=1.12)
  ↓ WebRTC
User Browser
```

---

## Risks Mitigated

1. **Production Safety**: Separate repos = zero risk to live clients
2. **Rollback Plan**: Keep production untouched, can abandon test repos if needed
3. **Feature Detection**: Try/except for speed param = works on any version
4. **Version Safety**: Minor upgrade only (1.2.x), no breaking changes expected

---

## Success Metrics

**Test these after deployment:**
1. Voice sounds more energetic (less robotic)
2. Reduced "thinking" pauses between responses
3. More natural pitch variation
4. Speed feels similar to Cerebras demo

**Compare against:**
- Cerebras demo: `https://cerebras.livekit.io/`
- Original production: `voice-bot-separate-git-voice-2-enhancement-tlflas-projects.vercel.app`

---

## References

**Documentation Created:**
- `/Users/tl/Development/voice-bot-cerebras-clean/backend/WHERE_WE_CAME_FROM.md`
- `/Users/tl/Development/voice-bot-cerebras-clean/frontend/WHERE_WE_CAME_FROM.md`
- `/Users/tl/Development/voice-bot-cerebras-clean/PROJECT_INFO.md`
- `/Users/tl/Development/voice-bot-cerebras-clean/SESSION_LOG.md` (this file)

**External Research:**
- Cartesia Sonic-3 docs: https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
- LiveKit Agents releases: https://github.com/livekit/agents/releases
- LiveKit Cartesia plugin: https://docs.livekit.io/reference/python/v1/livekit/plugins/cartesia/

---

**Session End**: Ready for user to add Vercel env vars and test.
