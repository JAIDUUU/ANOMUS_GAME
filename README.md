# Anomus 🎨✨
### Modern Real-Time Multiplayer Drawing & Guessing Game

**Anomus** is a modern, standalone, full-featured multiplayer drawing and guessing game built with Node.js, Express, Socket.IO, and HTML5 Canvas. Inspired by social sketching games, Anomus features a unique **Deep Neon Violet** aesthetic, an original mascot (**Nomu** the Painter), hardened backend security, and smooth real-time synchronization.

---

## 🌟 Key Features

### 1. 🎨 Original Identity & Visual Polish
- **Mascot & Logo**: Features **Nomu**, the playful beret-wearing painter mascot, alongside modern glowing typography and neon accents.
- **Deep Neon Violet Theme**: Custom dark theme with violet glassmorphism (`#0b0716`, `rgba(24, 15, 48, 0.94)`), vibrant neon violet (`#8b5cf6`), and neon cyan (`#06b6d4`) highlights.
- **Responsive Canvas**: Smooth 60 FPS drawing engine with touch support (`touch-action: none`), 26 colors, 4 brush sizes, flood fill bucket, undo, and clear canvas.
- **Sound Effects**: Audio notifications for joins, leaves, countdown ticks, round start/end, and correct guesses.

### 2. ⚡ Real-Time Multiplayer Engine
- **Cryptographic Room Codes**: Unpredictable 6-character hex codes (`crypto.randomBytes(3)`) preventing brute-force room enumeration.
- **Public & Private Matchmaking**: Instant one-click public queue or custom private lobbies with shareable URLs (`http://<ip>:3000/?<room_id>`).
- **Late-Joiner Canvas Synchronization**: Players connecting mid-round immediately receive and replay all active canvas strokes and letter hints.
- **Configurable Room Settings**:
  - **Rounds**: 2 to 10 rounds
  - **Draw Time**: 30s to 180s
  - **Word Count**: 1 to 5 choices per turn (honored in real-time)
  - **Hints**: Progressive letter reveals based on time remaining
  - **Custom Words**: Custom word lists with toggle for exclusive use

### 3. 🛡️ Security & Stability Hardening
- **Drawing Payload Caps**: Enforced max 150 commands per batch and a strict 12,000-command limit per turn with stroke structure validation to prevent socket buffer exhaustion.
- **Chat Rate Limiting**: Anti-spam token window (max 4 messages per 2 seconds). Floods trigger `MSG.SPAM_WARN` notifications.
- **Player Reporting & Vote-Kick**: Built-in player report handling (`MSG.REPORT`) with automatic removal if a player receives reports from the majority of the room.
- **Express 5 Compatibility**: Modern route handlers without wildcard parameter crashes.

### 4. 🤖 AI Bot Companion
- Built-in **"🤖 Add Bot Player"** button in private lobbies.
- Intelligent bots that choose words, draw recognizable shapes, submit close guesses, and celebrate with thumbs-up reactions. Perfect for solo testing or companion games.

### 5. 🌐 Multi-Language Architecture (English & Hindi/Hinglish Ready)
The dictionary architecture in `server.js` supports extensible word packs:
- **Default (0)**: Comprehensive English vocabulary in `words.json`.
- **Extending for Hindi / Hinglish**:
  In `server.js`:
  ```javascript
  const wordPacks = {
    0: require('./words.json'), // English
    1: require('./words_hi.json'), // Hindi (Devanagari)
    2: require('./words_hinglish.json') // Hinglish (Romanized Hindi)
  };
  ```

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone <repository_url> anomus
cd anomus
npm install
```

### 2. Running the Server
Start with Node directly:
```bash
npm start
```
Or manage in production with PM2:
```bash
pm2 start server.js --name anomus
pm2 save
```

### 3. Accessing the Game
Open your web browser at:
```text
http://localhost:3000
```
For local network play with friends or mobile devices:
```text
http://<your-lan-ip>:3000
```

---

## 🧪 Testing

The codebase includes comprehensive automated and browser-based test suites:

- **Run all integration and feature tests**:
  ```bash
  npm test
  ```
  *Tests multi-client socket connection, room generation, word selection, stroke broadcast, close/exact guess scoring, late-joiner canvas replay, rate-limiting, and report handling.*

- **Run AI Bot test**:
  ```bash
  npm run test:bot
  ```

---

## 📁 Project Structure

```text
├── server.js              # Production Node.js + Socket.IO game engine & security layers
├── words.json             # Primary dictionary (categorized and normalized)
├── package.json           # Dependencies and test scripts
├── public/                # Static frontend assets
│   ├── index.html         # Main game interface with Anomus branding & meta tags
│   ├── css/
│   │   └── style.css      # Deep Neon Violet theme and responsive styles
│   ├── js/
│   │   └── game.js        # Core frontend client, canvas engine, and socket controller
│   ├── img/
│   │   ├── anomus_logo.svg# Original vector logo with mascot Nomu
│   │   └── anomus_favicon.svg
│   └── audio/             # UI sound effects (Web Audio API)
├── docs/                  # Documentation and lobby/gameplay screenshots
└── original/              # Original reverse-engineered reference files
```
