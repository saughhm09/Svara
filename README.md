# SVARA - Expo Go Version

Voice-controlled Flappy Bird style game for mobile devices.

## Setup Instructions

### Step 1: Install Node.js
Make sure you have Node.js installed (version 18 or higher).

### Step 2: Install Expo CLI
```bash
npm install -g expo-cli
```

### Step 3: Install Dependencies
Navigate to the svara-expo folder and run:
```bash
cd svara-expo
npm install
```

### Step 4: Start the Development Server
```bash
npx expo start
```

### Step 5: Run on Your Phone
1. Install **Expo Go** app on your phone (from App Store or Play Store)
2. Scan the QR code shown in the terminal with:
   - **iOS**: Use the Camera app
   - **Android**: Use the Expo Go app's scanner
3. The game will load on your phone!

## Game Controls

- **Make sound** (talk, hum, sing) → Ball goes UP
- **Stay quiet** → Ball falls DOWN
- **Navigate through pipes** to score points!

## Settings

- **Sensitivity**: How fast the ball rises when you make sound
- **Volume Threshold**: Minimum volume needed to detect your voice
- **Gravity Strength**: How fast the ball falls
- **Pipe Speed**: How fast the pipes move towards you

## Troubleshooting

### Microphone not working?
- Make sure you granted microphone permission when prompted
- On iOS: Go to Settings > SVARA > Microphone > Enable
- On Android: Go to Settings > Apps > SVARA > Permissions > Microphone > Allow

### Game running slow?
- Close other apps running in the background
- Make sure your phone isn't in power saving mode

### Can't connect to Expo Go?
- Make sure your phone and computer are on the same WiFi network
- Try using the "tunnel" connection: `npx expo start --tunnel`
