const http = require('node:http');
const os = require('node:os');
const { WebSocketServer, WebSocket } = require('ws');

/** @typedef {{ send: (channel: string, ...args: unknown[]) => void }} EventTarget */

const DEFAULT_PORT = 17845;

function localAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.internal) continue;
      if (info.family !== 'IPv4' && info.family !== 4) continue;
      out.push(info.address);
    }
  }
  return out;
}

/**
 * Electron 메인에서만 쓰는 LAN WebSocket 허브.
 * 호스트: WS 서버. 게스트: WS 클라이언트. 렌더러와는 IPC로만 소통.
 */
function createLanHub({ logger, getWindow }) {
  /** @type {import('http').Server | null} */
  let server = null;
  /** @type {import('ws').WebSocketServer | null} */
  let wss = null;
  /** @type {import('ws').WebSocket | null} */
  let client = null;
  /** @type {'idle' | 'host' | 'guest'} */
  let role = 'idle';
  let port = DEFAULT_PORT;
  /** @type {Map<string, import('ws').WebSocket>} */
  const peers = new Map();
  let nextPeer = 1;

  function toRenderer(channel, payload) {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  function parse(raw) {
    try {
      return JSON.parse(String(raw));
    } catch {
      return null;
    }
  }

  function safeSend(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  async function hostStart(opts = {}) {
    if (role !== 'idle') await shutdown();
    port = Number(opts.port) || DEFAULT_PORT;
    await new Promise((resolve, reject) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('AUGMENTED POKER LAN');
      });
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    wss = new WebSocketServer({ server });
    role = 'host';
    peers.clear();
    wss.on('connection', (ws) => {
      const peerId = `p${nextPeer++}`;
      peers.set(peerId, ws);
      logger.info(`[lan] peer connected ${peerId}`);
      toRenderer('lan:peer', { type: 'connected', peerId });
      ws.on('message', (data) => {
        const msg = parse(data);
        if (!msg) return;
        toRenderer('lan:message', { from: peerId, msg });
      });
      ws.on('close', () => {
        peers.delete(peerId);
        logger.info(`[lan] peer disconnected ${peerId}`);
        toRenderer('lan:peer', { type: 'disconnected', peerId });
      });
      ws.on('error', (err) => logger.warn(`[lan] peer error ${peerId}: ${err?.message ?? err}`));
    });
    logger.info(`[lan] host listening :${port}`);
    return { ok: true, port, addresses: localAddresses(), role: 'host' };
  }

  async function connect({ host, port: p = DEFAULT_PORT }) {
    if (role !== 'idle') await shutdown();
    const url = `ws://${host}:${p || DEFAULT_PORT}`;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('연결 시간이 초과되었습니다.'));
      }, 8000);
      ws.once('open', () => {
        clearTimeout(timer);
        client = ws;
        role = 'guest';
        resolve();
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    client.on('message', (data) => {
      const msg = parse(data);
      if (!msg) return;
      toRenderer('lan:message', { from: 'host', msg });
    });
    client.on('close', () => {
      if (role === 'guest') {
        role = 'idle';
        client = null;
        toRenderer('lan:peer', { type: 'disconnected', peerId: 'host' });
      }
    });
    client.on('error', (err) => logger.warn(`[lan] client error: ${err?.message ?? err}`));
    logger.info(`[lan] connected to ${url}`);
    return { ok: true, port: p || DEFAULT_PORT, host, role: 'guest' };
  }

  function send(peerId, msg) {
    if (role === 'host') {
      const ws = peers.get(peerId);
      if (!ws) return false;
      safeSend(ws, msg);
      return true;
    }
    if (role === 'guest' && peerId === 'host' && client) {
      safeSend(client, msg);
      return true;
    }
    return false;
  }

  function broadcast(msg, exceptPeerId = null) {
    if (role !== 'host') return 0;
    let n = 0;
    for (const [id, ws] of peers) {
      if (exceptPeerId && id === exceptPeerId) continue;
      safeSend(ws, msg);
      n++;
    }
    return n;
  }

  async function shutdown() {
    const closing = [...peers.values()];
    peers.clear();
    for (const ws of closing) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    if (client) {
      try {
        client.close();
      } catch {
        /* ignore */
      }
      client = null;
    }
    if (wss) {
      await new Promise((r) => wss.close(() => r()));
      wss = null;
    }
    if (server) {
      await new Promise((r) => server.close(() => r()));
      server = null;
    }
    role = 'idle';
  }

  function status() {
    return {
      role,
      port,
      addresses: localAddresses(),
      peerCount: peers.size,
      connected: role === 'guest' ? Boolean(client && client.readyState === WebSocket.OPEN) : role === 'host',
    };
  }

  return {
    DEFAULT_PORT,
    localAddresses,
    hostStart,
    connect,
    send,
    broadcast,
    shutdown,
    status,
  };
}

module.exports = { createLanHub, DEFAULT_PORT, localAddresses };
