# SVARA

SVARA is a voice-controlled game inspired by Flappy Bird. Instead of tapping a screen, you use your voice — make sound to push the orb upward, go quiet to let it fall. The goal is to navigate a glowing orb through an endless series of pipe gaps for as long as possible.

The game exists in two forms: a standalone web version (`svara_complete.html`) and a React Native mobile version (`svara-details/`). Both share the same core mechanics but differ in features and implementation.

Microphone permission is required to play.

---

## Project Structure

```
Svara (Solo)/
├── svara_complete.html       # Full web version, open in any browser
└── svara-details/
    ├── App.js                # React Native mobile version
    ├── app.json              # Expo app configuration
    ├── package.json          # Dependencies
    └── README.md             # This file
```

---

## Running the Mobile Version

**Prerequisites:** Node.js 18+

```bash
cd svara-details
npm install
npx expo start
```

Scan the QR code from the terminal using your phone's camera (iOS) or the camera app (Android) to launch the game on your device.

**Running on a specific platform:**
```bash
npx expo start --android
npx expo start --ios
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `expo` | ~51.0.0 | App runtime and build tooling |
| `expo-av` | ~14.0.0 | Microphone access and audio metering |
| `expo-status-bar` | ~1.12.0 | Status bar styling |
| `react` | 18.2.0 | UI framework |
| `react-native` | 0.74.0 | Native mobile rendering |
| `@react-native-community/slider` | ^4.5.0 | Settings sliders |

---

## Running the Web Version

No setup needed. Open `svara_complete.html` directly in any modern browser (Chrome, Firefox, Edge, Safari). The browser will request microphone access on first play.

The web version uses the **Web Audio API** (`AudioContext`, `AnalyserNode`) to process microphone input in real time. Audio is sampled at 44100 Hz with an FFT size of 4096 for high-resolution volume measurement.

---

## How to Play

The game starts in a **waiting state** after you press Start. The orb floats at the center of the screen. The moment you make any sound above the volume threshold, gameplay begins.

| Action | Effect |
|--------|--------|
| Make sound (talk, hum, sing, clap) | Orb moves **up** |
| Stay quiet | Orb falls **down** due to gravity |
| Hit a pipe or screen boundary | **Game over** |
| Pass through a pipe gap | +1 point |

The orb is fixed horizontally at x=150 (pixels). Pipes scroll toward the orb from the right. Each pipe has a randomized gap position, constrained so the gap is never too close to the top or bottom edge.

---

## Game States

The game cycles through four states:

1. **start** — Home/title screen. No audio running yet.
2. **waiting** — Audio is active, orb is stable with damping. Waiting for first sound to trigger gameplay.
3. **playing** — Full physics active. Pipes are moving, collisions are checked.
4. **gameOver** — Audio stops, final score displayed. Player can restart or go to settings.

---

## Physics & Mechanics

### Orb Physics

The orb is subject to gravity every frame. When voice is detected above the threshold, an upward force is applied. The net result is that sustained sound keeps the orb aloft, and silence lets it fall.

**Gravity calculation (web version):**
```
gravity = 0.15 + (gravitySlider * 0.02)
```
Gravity slider range is -10 to +10, giving a gravity range of roughly 0.05 (floaty) to 0.35 (heavy).

**Upward force when voice detected:**
```
upwardForce = sensitivity * difficulty * 3
```
Sensitivity is normalized from 0–10 slider to 0.0–1.0.

**Velocity cap:**
```
maxVelocity = 2.5 + (gravitySlider * 0.2)
```
Velocity is clamped each frame to prevent runaway acceleration.

**Mobile version gravity:**
```
gravity = (0.01 + ((gravityStrength + 7) * 0.02)) * SCALE
```
All values are scaled by `Math.min(screenWidth/800, screenHeight/600)` to normalize across different device screen sizes.

### Pipe Mechanics

- 3 pipes are initialized off-screen to the right on game start, spaced 300px apart.
- Pipes scroll left at a speed determined by the selected difficulty level multiplied by the current difficulty scalar.
- When a pipe scrolls off the left edge, it is removed. A new pipe is generated when the last pipe in the array crosses a threshold distance from the right edge.
- Gap size in the web version starts at 250px and shrinks as difficulty increases: `gap = max(120, 250 - (difficulty - 1) * 30)`. Minimum gap is 120px.
- Gap position is randomized with 100px padding from both screen edges.

### Difficulty Scaling (Web Version Only)

Difficulty starts at 1.0 and increases by 0.001 per point scored, capping at 2.0:
```
difficulty = min(2.0, 1.0 + score * 0.001)
```
This means at score 1000, difficulty reaches its maximum. Difficulty multiplies both pipe speed and gravity, making the game progressively harder the longer you survive.

### Collision Detection

Collision is AABB (axis-aligned bounding box) against the orb's circular bounds:

- Orb bounds: `(orbX ± radius, orbY ± radius)`
- Pipe bounds: `(pipe.x to pipe.x + pipeWidth, 0 to topHeight)` and `(pipe.x to pipe.x + pipeWidth, bottomY to screenHeight)`
- Boundary check: game over if `orbTop <= 0` or `orbBottom >= screenHeight`

### Audio Processing

**Web version** uses the Web Audio API:
- Microphone stream → `MediaStreamSource` → `AnalyserNode`
- `getFloatTimeDomainData()` fills a Float32Array with PCM waveform data
- RMS (Root Mean Square) is calculated across all samples: `sqrt(sum(x²) / n)`
- RMS is scaled aggressively (`rawVolume * 100`) and clamped to 0–1
- This value is compared against the threshold each frame

**Mobile version** uses `expo-av` Audio Recording with metering enabled:
- Audio recorded at 44100 Hz, mono, 128kbps AAC
- `getStatusAsync()` returns a `metering` value in dB (typically -160 to 0)
- Converted to 0–1 range: `(db + 60) / 60`, clamped
- Checked each animation frame via `requestAnimationFrame`

---

## Settings

Settings are accessible from the home screen, the game ready screen, and the game over screen.

### Sensitivity
- **Range:** 0–10 (default: 5)
- Controls how strongly voice input pushes the orb upward.
- Higher = orb rises faster with the same amount of sound.
- Web formula: `upwardForce = (sensitivity / 10) * difficulty * 3`
- Mobile formula: `upwardForce = (sensitivity / 25) * 2 * SCALE`

### Volume Threshold
- **Range:** 0–10 (default: 3)
- The minimum volume level required to register as "voice detected."
- Visually represented as a red line on the volume bar during gameplay.
- Internally mapped: slider value / 10 → 0.0 to 1.0 threshold
- Lower = more sensitive (whispers register). Higher = requires louder input.

### Gravity Strength
- **Range:** -10 to +10 (default: 0)
- Controls how fast the orb falls each frame.
- Negative values make the orb buoyant (floats upward without voice).
- Positive values make gravity heavier and the game harder.
- Also affects maximum velocity cap.

### Pipe Speed (Web) / Pipe Speed Level (Mobile)

**Web version speed multipliers:**
| Level | Multiplier | Effective Speed |
|-------|------------|-----------------|
| Very Easy | 2× | Slow |
| Easy | 4× | Normal (default) |
| Medium | 6× | Fast |
| Hard | 8× | Very Fast |
| Child Mode | custom | See below |

**Mobile version speed multipliers:**
| Level | Multiplier |
|-------|------------|
| Very Easy | 0.5× |
| Easy | 1.0× (default) |
| Medium | 1.5× |
| Hard | 2.5× |
| Very Hard | 4.0× |

### Child Mode (Web Version Only)
- A dedicated speed mode with a secondary sub-slider.
- Child Mode Speed slider ranges from 1–10, mapped internally to 0.1–1.0 pipe speed multiplier.
- When Child Mode is active, gravity is also scaled down proportionally to the child mode speed, making the overall feel much lighter and more forgiving.
- Child Mode speed and gravity are linked: slower pipes also means gentler gravity.

---

## Color Themes (Web Version Only)

Five themes restyle the background, pipes, orb, orb glow, volume bar, UI text, and buttons simultaneously.

| Theme | Background | Pipe | Orb | Accent |
|-------|------------|------|-----|--------|
| Classic Blue | `#0f3460` | `#16213e` | `#f39c12` | `#e94560` |
| Sunset Orange | `#2d1b2e` | `#5c3d5e` | `#ff6b35` | `#f7931e` |
| Forest Green | `#1a3a2e` | `#2d5a4a` | `#7bed9f` | `#2ed573` |
| Midnight Purple | `#1e1e2e` | `#2e2e3e` | `#bd93f9` | `#ff79c6` |
| Ocean Teal | `#0a3d62` | `#1e5f74` | `#00d2d3` | `#1abc9c` |

Theme selection is applied immediately via inline style updates — the canvas background, page background, all buttons, score text, and UI panels update in real time.

---

## Leaderboard (Web Version Only)

- Stores the **top 10 scores** in `localStorage` under the key `svaraLeaderboard`.
- After a game over, if the player's score qualifies for the top 10, a name entry panel appears.
- Player can enter a name (up to 20 characters) or skip.
- Each leaderboard entry stores: player name, score, date, and the full settings used (sensitivity, volume threshold, gravity, pipe speed, theme).
- Rankings 1–3 are visually distinguished with gold, silver, and bronze styling and emoji medals (🥇🥈🥉).
- The leaderboard can be fully cleared via a "Clear All" button (with a confirmation prompt).

---

## Debug Panel (Web Version Only)

A live debug overlay is shown in the bottom-left corner during gameplay, displaying:

- Current volume level (raw 0.0000 float)
- Voice active status (Yes / No)
- Current game state
- Active pipe speed level
- Sensitivity value
- Volume threshold (slider value + computed float)
- Gravity strength

This panel is always visible during gameplay in the web version and is useful for calibrating the volume threshold to your microphone and environment.

---

## Volume Indicator (Both Versions)

A vertical bar in the top-right corner shows real-time microphone input:
- **Yellow/orange fill** rises and falls with your voice volume.
- **Red line** marks the current volume threshold. Sound above this line controls the orb.

This gives immediate visual feedback so players can see exactly whether their voice is registering.

---

## Differences Between Web and Mobile Versions

| Feature | Web (`svara_complete.html`) | Mobile (`App.js`) |
|---------|----------------------------|-------------------|
| Platform | Any browser | iOS & Android |
| Audio API | Web Audio API (RMS from PCM) | expo-av (dB metering) |
| Canvas | HTML5 Canvas (800×600) | React Native Views |
| Rendering | `requestAnimationFrame` + Canvas 2D | React state + absolute positioned Views |
| Themes | 5 color themes | Classic Blue only |
| Leaderboard | Yes (localStorage) | No |
| Debug panel | Yes | No |
| Child Mode | Yes (with gravity scaling) | No |
| Difficulty scaling | Yes (increases with score) | No |
| Pipe gap shrinking | Yes | No |
| Speed levels | Very Easy / Easy / Medium / Hard / Child | Very Easy / Easy / Medium / Hard / Very Hard |

---

## Troubleshooting

**Microphone not working?**
- Grant microphone permission when prompted on first launch.
- iOS: Settings → SVARA → Microphone → Enable
- Android: Settings → Apps → SVARA → Permissions → Microphone → Allow
- Web: Click the lock icon in the browser address bar → allow microphone

**Orb not responding to voice?**
- Lower the Volume Threshold in settings (try 1 or 2).
- Increase Sensitivity.
- Check the volume bar — if it's not moving at all, the microphone isn't being detected.
- On web, make sure the browser has microphone permission (not just dismissed the prompt).

**Orb rising uncontrollably without sound?**
- Volume Threshold is too low — background noise is being picked up. Increase it.
- If in a noisy environment, try threshold 5–7.

**Game feels too hard / too easy?**
- Adjust Pipe Speed to a lower level.
- Lower gravity makes the orb easier to control.
- On web, Child Mode with a low speed gives the most relaxed experience.

**Mobile game feels stuttery?**
- Close background apps.
- Disable power saving mode.
- Note: the current mobile game loop re-creates the effect on every state update, which can cause minor inconsistencies — this is a known limitation of the current React state-based approach.
