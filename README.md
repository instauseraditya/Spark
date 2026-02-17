# ⚡ Spark — Random Video & Voice Chat

An Omegle-style random chat app using **WebRTC** (peer-to-peer, free & open source) and **Socket.io** for signaling. No accounts, no tracking.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

### 3. Open your browser
```
http://localhost:3000
```

> ⚠️ **Camera/microphone access requires HTTPS in production** (or localhost for development). Browsers block `getUserMedia()` on plain HTTP.

---

## 📁 Project Structure

```
spark-random-chat/
├── server.js          ← Node.js signaling server (Express + Socket.io)
├── package.json
└── public/
    └── index.html     ← Complete frontend (WebRTC, UI, chat)
```

---

## 🛠️ How It Works

### Signaling (server.js)
- Users connect via WebSocket (Socket.io)
- Server maintains two queues: **video** and **audio**
- When 2 users are in the same queue → create a private room → notify both
- Server relays: SDP offers/answers, ICE candidates, chat messages
- Server handles: skip, disconnect, partner_left events

### WebRTC (index.html)
- `getUserMedia()` → get camera/mic stream
- `RTCPeerConnection` → direct peer-to-peer connection
- STUN servers (Google, free) → NAT traversal
- No media goes through your server — only signaling data does

### Features
- 📹 **Video Call** — camera + mic
- 🎙️ **Voice Only** — mic only, no camera
- 💬 **Live Text Chat** — alongside video/audio
- ⏭️ **Skip** — instantly find next stranger
- 🔇 **Mute / Camera toggle**
- 🌐 **Online counter** — live user count

---

## 🌐 Deploying to Production

### Option A: Railway / Render / Fly.io (free tier)
```bash
# Just push to GitHub and connect to Railway/Render
# They auto-detect Node.js apps
```

### Option B: HTTPS with nginx (required for camera access)
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # SSL certs (use Let's Encrypt / certbot - free)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Option C: Add TURN server for better connectivity
For users behind strict NAT/firewalls, add a TURN server to `iceServers` in `index.html`:
```js
// Free TURN: Open Relay (coturn) or use Metered.ca free tier
{ urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' }
```

---

## 📦 Dependencies
| Package | Purpose | License |
|---------|---------|---------|
| [express](https://expressjs.com) | HTTP server | MIT |
| [socket.io](https://socket.io) | WebSocket signaling | MIT |
| WebRTC | P2P video/audio | Browser built-in |
| Manrope font | Typography | OFL |
| Google STUN | NAT traversal | Free |

All dependencies are **free and open source**.

---

## 🔒 Privacy Notes
- **No media is stored** — video/audio streams are peer-to-peer
- **Chat messages** relay through your server but are not logged by default
- **No user accounts** required
- Add rate limiting, content moderation, or reporting features for production use
