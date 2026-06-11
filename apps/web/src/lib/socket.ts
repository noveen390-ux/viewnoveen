'use client';

import { io, Socket } from 'socket.io-client';

let syncSocket: Socket | null = null;
let webrtcSocket: Socket | null = null;

export function getSyncSocket(token?: string): Socket {
  if (!syncSocket) {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
    syncSocket = io(`${baseUrl}/sync`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  if (token && !syncSocket.connected) {
    syncSocket.auth = { token };
  }
  return syncSocket;
}

export function getWebRTCSocket(token?: string): Socket {
  if (!webrtcSocket) {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
    webrtcSocket = io(`${baseUrl}/webrtc`, {
      transports: ['websocket'],
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  if (token && !webrtcSocket.connected) {
    webrtcSocket.auth = { token };
  }
  return webrtcSocket;
}

export function disconnectSync() {
  if (syncSocket) {
    syncSocket.disconnect();
    syncSocket = null;
  }
}

export function disconnectWebRTC() {
  if (webrtcSocket) {
    webrtcSocket.disconnect();
    webrtcSocket = null;
  }
}
