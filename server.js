
import express from 'express';
import path from 'path';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import dgram from 'dgram';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Server-side clock state
let serverClockState = {
  minutes: 5,
  seconds: 0,
  currentRound: 1,
  totalRounds: 3,
  isRunning: false,
  isPaused: false,
  elapsedMinutes: 0,
  elapsedSeconds: 0,
  pauseStartTime: null,
  totalPausedTime: 0,
  currentPauseDuration: 0,
  isBetweenRounds: false,
  betweenRoundsMinutes: 0,
  betweenRoundsSeconds: 0,
  initialTime: { minutes: 5, seconds: 0 },
  betweenRoundsEnabled: true,
  betweenRoundsTime: 60,
  lastUpdateTime: Date.now()
};

let serverTimer = null;

// Track connected WebSocket clients
const connectedClients = new Map();

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function broadcastClients() {
  const clients = Array.from(connectedClients.values()).map(c => ({
    id: c.id,
    ip: c.ip,
    url: c.url,
    connectedAt: c.connectedAt
  }));
  broadcast({ type: 'clients', clients });
}

function queryNtpTime(server) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const packet = Buffer.alloc(48);
    packet[0] = 0x1b; // NTP client request

    const timeout = setTimeout(() => {
      client.close();
      reject(new Error('NTP request timed out'));
    }, 10000);

    client.once('error', err => {
      clearTimeout(timeout);
      client.close();
      reject(err);
    });

    client.once('message', msg => {
      clearTimeout(timeout);
      client.close();
      const seconds = msg.readUInt32BE(40) - 2208988800;
      resolve(seconds * 1000);
    });

    client.send(packet, 0, packet.length, 123, server, err => {
      if (err) {
        clearTimeout(timeout);
        client.close();
        reject(err);
      }
    });
  });
}

function queryWorldTime() {
  const url = 'https://worldtimeapi.org/api/ip';
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(new Date(json.utc_datetime).getTime());
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function broadcast(data) {
  const message = JSON.stringify(data);
  console.log('Broadcasting to', wss.clients.size, 'clients:', data.type || data.action);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function startServerTimer() {
  if (serverTimer) {
    clearInterval(serverTimer);
  }
  
  console.log('Starting server timer');
  serverTimer = setInterval(() => {
    if (serverClockState.isRunning && !serverClockState.isPaused) {
      updateServerClock();
      broadcast({ type: 'status', ...serverClockState });
    }
    
    // Update pause duration if paused
    if (serverClockState.isPaused && serverClockState.pauseStartTime) {
      const pauseDuration = Math.floor((Date.now() - serverClockState.pauseStartTime) / 1000);
      serverClockState.currentPauseDuration = pauseDuration;
      broadcast({ type: 'status', ...serverClockState });
    }
  }, 1000);
}

function updateServerClock() {
  if (serverClockState.isBetweenRounds) {
    // Count up during between rounds
    const newSeconds = serverClockState.betweenRoundsSeconds + 1;
    const newMinutes = newSeconds >= 60 ? serverClockState.betweenRoundsMinutes + 1 : serverClockState.betweenRoundsMinutes;
    const adjustedSeconds = newSeconds >= 60 ? 0 : newSeconds;

    const totalBetweenRoundsTime = serverClockState.betweenRoundsTime;
    const currentBetweenRoundsTime = newMinutes * 60 + adjustedSeconds;

    if (currentBetweenRoundsTime >= totalBetweenRoundsTime) {
      // Between rounds complete, advance to next round
      if (serverClockState.currentRound < serverClockState.totalRounds) {
        serverClockState.currentRound += 1;
        serverClockState.minutes = serverClockState.initialTime.minutes;
        serverClockState.seconds = serverClockState.initialTime.seconds;
        serverClockState.isBetweenRounds = false;
        serverClockState.betweenRoundsMinutes = 0;
        serverClockState.betweenRoundsSeconds = 0;
        serverClockState.elapsedMinutes = 0;
        serverClockState.elapsedSeconds = 0;
        serverClockState.isRunning = false;
        serverClockState.isPaused = false;
        serverClockState.totalPausedTime = 0;
        serverClockState.currentPauseDuration = 0;
        serverClockState.pauseStartTime = null;
        console.log('Between rounds complete, advanced to round', serverClockState.currentRound);
      } else {
        // All rounds complete
        serverClockState.isRunning = false;
        serverClockState.isBetweenRounds = false;
        console.log('All rounds complete');
      }
    } else {
      serverClockState.betweenRoundsMinutes = newMinutes;
      serverClockState.betweenRoundsSeconds = adjustedSeconds;
      serverClockState.minutes = newMinutes;
      serverClockState.seconds = adjustedSeconds;
    }
  } else {
    // Regular countdown logic
    const newSeconds = serverClockState.seconds - 1;
    const newMinutes = newSeconds < 0 ? serverClockState.minutes - 1 : serverClockState.minutes;
    const adjustedSeconds = newSeconds < 0 ? 59 : newSeconds;

    const totalElapsed = (serverClockState.initialTime.minutes * 60 + serverClockState.initialTime.seconds) - (newMinutes * 60 + adjustedSeconds);
    const elapsedMinutes = Math.floor(totalElapsed / 60);
    const elapsedSeconds = totalElapsed % 60;

    if (newMinutes < 0) {
      if (serverClockState.currentRound < serverClockState.totalRounds) {
        if (serverClockState.betweenRoundsEnabled) {
          // Start between rounds timer
          serverClockState.minutes = 0;
          serverClockState.seconds = 0;
          serverClockState.isBetweenRounds = true;
          serverClockState.betweenRoundsMinutes = 0;
          serverClockState.betweenRoundsSeconds = 0;
          serverClockState.elapsedMinutes = elapsedMinutes;
          serverClockState.elapsedSeconds = elapsedSeconds;
          console.log('Starting between rounds timer');
        } else {
          // Auto-advance to next round
          serverClockState.currentRound += 1;
          serverClockState.minutes = serverClockState.initialTime.minutes;
          serverClockState.seconds = serverClockState.initialTime.seconds;
          serverClockState.elapsedMinutes = 0;
          serverClockState.elapsedSeconds = 0;
          console.log('Auto-advanced to round', serverClockState.currentRound);
        }
      } else {
        // All rounds complete
        serverClockState.isRunning = false;
        serverClockState.minutes = 0;
        serverClockState.seconds = 0;
        serverClockState.elapsedMinutes = elapsedMinutes;
        serverClockState.elapsedSeconds = elapsedSeconds;
        console.log('Timer completed - all rounds finished');
      }
    } else {
      serverClockState.minutes = newMinutes;
      serverClockState.seconds = adjustedSeconds;
      serverClockState.elapsedMinutes = elapsedMinutes;
      serverClockState.elapsedSeconds = elapsedSeconds;
    }
  }
}

wss.on('connection', ws => {
  console.log('New WebSocket connection established');
  const clientInfo = {
    id: Math.random().toString(36).slice(2),
    ip: normalizeIp(ws._socket.remoteAddress),
    url: '',
    connectedAt: Date.now()
  };
  connectedClients.set(ws, clientInfo);
  // Send current server state to new connections
  ws.send(JSON.stringify({ type: 'status', ...serverClockState }));
  broadcastClients();

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg.toString());
      console.log('WebSocket message received:', data.type);
      if (data.type === 'sync-settings') {
        // Sync settings from client (initial time, rounds, between rounds config)
        serverClockState.initialTime = data.initialTime || serverClockState.initialTime;
        serverClockState.totalRounds = data.totalRounds || serverClockState.totalRounds;
        if (typeof data.betweenRoundsEnabled === 'boolean') {
          serverClockState.betweenRoundsEnabled = data.betweenRoundsEnabled;
        }
        if (typeof data.betweenRoundsTime === 'number') {
          serverClockState.betweenRoundsTime = data.betweenRoundsTime;
        }
        if (data.url) {
          const info = connectedClients.get(ws);
          if (info) {
            info.url = data.url;
          }
        }
        broadcastClients();
        console.log('Settings synced from client');
      }
    } catch (err) {
      console.error('Invalid WS message', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    connectedClients.delete(ws);
    broadcastClients();
  });
});

// Start the server timer immediately
startServerTimer();

app.post('/api/start', (_req, res) => {
  console.log('API: Start timer');
  if (serverClockState.isPaused && serverClockState.pauseStartTime) {
    serverClockState.totalPausedTime += Math.floor((Date.now() - serverClockState.pauseStartTime) / 1000);
  }
  serverClockState.isRunning = true;
  serverClockState.isPaused = false;
  serverClockState.pauseStartTime = null;
  serverClockState.currentPauseDuration = 0;
  broadcast({ action: 'start' });
  res.json({ success: true });
});

app.post('/api/pause', (_req, res) => {
  console.log('API: Pause/Resume timer');
  if (serverClockState.isPaused) {
    // Resume
    if (serverClockState.pauseStartTime) {
      serverClockState.totalPausedTime += Math.floor((Date.now() - serverClockState.pauseStartTime) / 1000);
    }
    serverClockState.isPaused = false;
    serverClockState.pauseStartTime = null;
    serverClockState.currentPauseDuration = 0;
  } else {
    // Pause
    serverClockState.isPaused = true;
    serverClockState.pauseStartTime = Date.now();
  }
  broadcast({ action: 'pause' });
  res.json({ success: true });
});

app.post('/api/reset', (_req, res) => {
  console.log('API: Reset all');
  serverClockState.currentRound = 1;
  serverClockState.minutes = serverClockState.initialTime.minutes;
  serverClockState.seconds = serverClockState.initialTime.seconds;
  serverClockState.isRunning = false;
  serverClockState.isPaused = false;
  serverClockState.elapsedMinutes = 0;
  serverClockState.elapsedSeconds = 0;
  serverClockState.pauseStartTime = null;
  serverClockState.totalPausedTime = 0;
  serverClockState.currentPauseDuration = 0;
  serverClockState.isBetweenRounds = false;
  serverClockState.betweenRoundsMinutes = 0;
  serverClockState.betweenRoundsSeconds = 0;
  broadcast({ action: 'reset' });
  res.json({ success: true });
});

app.post('/api/reset-time', (_req, res) => {
  console.log('API: Reset time only');
  serverClockState.minutes = serverClockState.initialTime.minutes;
  serverClockState.seconds = serverClockState.initialTime.seconds;
  serverClockState.isRunning = false;
  serverClockState.isPaused = false;
  serverClockState.elapsedMinutes = 0;
  serverClockState.elapsedSeconds = 0;
  serverClockState.pauseStartTime = null;
  serverClockState.totalPausedTime = 0;
  serverClockState.currentPauseDuration = 0;
  broadcast({ action: 'reset-time' });
  res.json({ success: true });
});

app.post('/api/reset-rounds', (_req, res) => {
  console.log('API: Reset rounds');
  serverClockState.currentRound = 1;
  serverClockState.minutes = serverClockState.initialTime.minutes;
  serverClockState.seconds = serverClockState.initialTime.seconds;
  serverClockState.isRunning = false;
  serverClockState.isPaused = false;
  serverClockState.elapsedMinutes = 0;
  serverClockState.elapsedSeconds = 0;
  serverClockState.pauseStartTime = null;
  serverClockState.totalPausedTime = 0;
  serverClockState.currentPauseDuration = 0;
  serverClockState.isBetweenRounds = false;
  serverClockState.betweenRoundsMinutes = 0;
  serverClockState.betweenRoundsSeconds = 0;
  broadcast({ action: 'reset-rounds' });
  res.json({ success: true });
});

app.post('/api/next-round', (_req, res) => {
  console.log('API: Next round');
  if (serverClockState.currentRound < serverClockState.totalRounds) {
    serverClockState.currentRound += 1;
    serverClockState.minutes = serverClockState.initialTime.minutes;
    serverClockState.seconds = serverClockState.initialTime.seconds;
    serverClockState.elapsedMinutes = 0;
    serverClockState.elapsedSeconds = 0;
    serverClockState.isRunning = false;
    serverClockState.isPaused = false;
    serverClockState.totalPausedTime = 0;
    serverClockState.currentPauseDuration = 0;
    serverClockState.pauseStartTime = null;
    serverClockState.isBetweenRounds = false;
    serverClockState.betweenRoundsMinutes = 0;
    serverClockState.betweenRoundsSeconds = 0;
  }
  broadcast({ action: 'next-round' });
  res.json({ success: true });
});

app.post('/api/previous-round', (_req, res) => {
  console.log('API: Previous round');
  if (serverClockState.currentRound > 1) {
    serverClockState.currentRound -= 1;
    serverClockState.minutes = serverClockState.initialTime.minutes;
    serverClockState.seconds = serverClockState.initialTime.seconds;
    serverClockState.elapsedMinutes = 0;
    serverClockState.elapsedSeconds = 0;
    serverClockState.isRunning = false;
    serverClockState.isPaused = false;
    serverClockState.totalPausedTime = 0;
    serverClockState.currentPauseDuration = 0;
    serverClockState.pauseStartTime = null;
    serverClockState.isBetweenRounds = false;
    serverClockState.betweenRoundsMinutes = 0;
    serverClockState.betweenRoundsSeconds = 0;
  }
  broadcast({ action: 'previous-round' });
  res.json({ success: true });
});

app.post('/api/adjust-time', (req, res) => {
  console.log('API: Adjust time by seconds');
  const { seconds } = req.body;
  if (typeof seconds === 'number' && (!serverClockState.isRunning || serverClockState.isPaused) && !serverClockState.isBetweenRounds) {
    const totalSeconds = serverClockState.minutes * 60 + serverClockState.seconds + seconds;
    const newMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
    const newSeconds = Math.max(0, totalSeconds) % 60;
    
    serverClockState.minutes = newMinutes;
    serverClockState.seconds = newSeconds;
    serverClockState.initialTime = { minutes: newMinutes, seconds: newSeconds };
    
    broadcast({ action: 'adjust-time', minutes: newMinutes, seconds: newSeconds });
    broadcast({ type: 'status', ...serverClockState });
  }
  res.json({ success: true });
});

app.post('/api/set-time', (req, res) => {
  console.log('API: Set time');
  const { minutes, seconds } = req.body;
  serverClockState.initialTime = { minutes: minutes || 5, seconds: seconds || 0 };
  serverClockState.minutes = minutes || 5;
  serverClockState.seconds = seconds || 0;
  serverClockState.elapsedMinutes = 0;
  serverClockState.elapsedSeconds = 0;
  serverClockState.isRunning = false;
  serverClockState.isPaused = false;
  serverClockState.totalPausedTime = 0;
  serverClockState.currentPauseDuration = 0;
  serverClockState.pauseStartTime = null;
  broadcast({ action: 'set-time', minutes, seconds });
  // Immediately broadcast updated status so all clients reflect the change
  broadcast({ type: 'status', ...serverClockState });
  res.json({ success: true });
});

app.post('/api/set-rounds', (req, res) => {
  console.log('API: Set rounds');
  const { rounds } = req.body;
  serverClockState.totalRounds = rounds || 3;
  serverClockState.currentRound = 1;
  broadcast({ action: 'set-rounds', rounds });
  res.json({ success: true });
});

app.post('/api/set-between-rounds', (req, res) => {
  console.log('API: Set between rounds settings');
  const { enabled, time } = req.body;
  if (typeof enabled === 'boolean') {
    serverClockState.betweenRoundsEnabled = enabled;
  }
  if (typeof time === 'number') {
    serverClockState.betweenRoundsTime = time;
  }
  res.json({ success: true });
});

app.get('/api/ntp-sync', async (req, res) => {
  const ntpServer = req.query.server || 'time.google.com';
  try {
    const before = Date.now();
    let serverTime;
    try {
      serverTime = await queryNtpTime(ntpServer);
    } catch (err) {
      console.error('NTP sync failed:', err);
      serverTime = await queryWorldTime();
    }
    const after = Date.now();
    const networkDelay = (after - before) / 2;
    const clientTime = before + networkDelay;
    const offset = serverTime - clientTime;
    res.json({ offset, lastSync: new Date().toISOString() });
  } catch (err) {
    console.error('Time sync failed:', err);
    res.status(500).json({ error: 'Time sync failed' });
  }
});

app.get('/api/status', (req, res) => {
  const { fields } = req.query;
  if (fields) {
    const requested = String(fields)
      .split(',')
      .map(f => f.trim())
      .filter(Boolean);
    const filtered = {};
    requested.forEach(f => {
      if (Object.prototype.hasOwnProperty.call(serverClockState, f)) {
        filtered[f] = serverClockState[f];
      }
    });
    return res.json(filtered);
  }

  res.json({
    ...serverClockState,
    serverTime: Date.now(),
    api_version: "1.0.0",
    connection_protocol: "http_rest_websocket"
  });
});

// Enhanced API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: "Tournament Clock API Documentation",
    version: "1.0.0",
    base_url: `http://${req.get('host')}`,
    connection_protocols: {
      http_rest: {
        description: "HTTP REST API for clock control and status",
        base_path: "/api"
      },
      websocket: {
        description: "Real-time WebSocket updates",
        endpoint: `ws://${req.get('host')}`,
        events: ["status", "action"]
      }
    },
    endpoints: {
      control: {
        "POST /api/start": "Start the countdown timer",
        "POST /api/pause": "Pause/Resume the timer",
        "POST /api/reset": "Reset timer to initial settings",
        "POST /api/reset-time": "Reset only the timer",
        "POST /api/reset-rounds": "Reset timer and round count",
        "POST /api/next-round": "Skip to next round",
        "POST /api/previous-round": "Go to previous round",
        "POST /api/adjust-time": {
          description: "Adjust time by seconds (only when stopped or paused)",
          body: { seconds: "number (positive or negative)" }
        }
      },
      configuration: {
        "POST /api/set-time": {
          description: "Set timer duration",
          body: { minutes: "number", seconds: "number" }
        },
        "POST /api/set-rounds": {
          description: "Set total rounds",
          body: { rounds: "number" }
        },
        "POST /api/set-between-rounds": {
          description: "Configure between rounds timer",
          body: { enabled: "boolean", time: "number (seconds)" }
        }
      },
      status: {
        "GET /api/status": {
          description: "Get current timer state",
          query_params: {
            fields: "Comma-separated list of specific fields to return"
          },
          response_fields: {
            minutes: "Current minutes remaining",
            seconds: "Current seconds remaining",
            currentRound: "Current round number",
            totalRounds: "Total number of rounds",
            isRunning: "Whether timer is active",
            isPaused: "Whether timer is paused",
            elapsedMinutes: "Minutes elapsed in current round",
            elapsedSeconds: "Seconds elapsed in current round",
            isBetweenRounds: "Whether in between-rounds phase",
            betweenRoundsMinutes: "Between rounds timer minutes",
            betweenRoundsSeconds: "Between rounds timer seconds",
            betweenRoundsEnabled: "Between rounds timer enabled",
            betweenRoundsTime: "Between rounds timer duration (seconds)",
            totalPausedTime: "Total time paused (seconds)",
            currentPauseDuration: "Current pause duration (seconds)",
            serverTime: "Server timestamp",
            api_version: "API version",
            connection_protocol: "Supported protocols"
          }
        }
      },
      display: {
        "GET /clockpretty": "Beautiful dark dashboard display (read-only)",
        "GET /clockarena": "Compact arena-style countdown display"
      },
      documentation: {
        "GET /api/docs": "This API documentation"
      }
    },
    websocket_messages: {
      incoming: {
        "sync-settings": "Sync client settings to server"
      },
      outgoing: {
        status: "Real-time clock state updates",
        action: "Action confirmations"
      }
    },
    integration_examples: {
      bitfocus_companion: {
        module: "Generic HTTP",
        base_url: `http://${req.get('host')}`,
        examples: {
          start_button: "POST /api/start",
          pause_button: "POST /api/pause",
          reset_button: "POST /api/reset",
          status_feedback: "GET /api/status?fields=minutes,seconds,isRunning",
          adjust_time_up: "POST /api/adjust-time -d '{\"seconds\":1}'",
          adjust_time_down: "POST /api/adjust-time -d '{\"seconds\":-1}'"
        }
      },
      curl_examples: {
        start_timer: `curl -X POST http://${req.get('host')}/api/start`,
        get_status: `curl http://${req.get('host')}/api/status`,
        set_time: `curl -X POST http://${req.get('host')}/api/set-time -H "Content-Type: application/json" -d '{"minutes":5,"seconds":30}'`,
        adjust_time: `curl -X POST http://${req.get('host')}/api/adjust-time -H "Content-Type: application/json" -d '{"seconds":10}'`
      }
    }
  });
});

const dist = join(__dirname, 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => {
  res.sendFile(join(dist, 'index.html'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api/docs`);
  console.log('Server-side clock initialized and running');
  broadcastClients();
});
