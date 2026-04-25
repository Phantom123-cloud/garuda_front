'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export type AdminCommand =
  | { type: 'kick' }
  | { type: 'set-pause'; payload: { pauseReasonLabel: string | null } }
  | { type: 'set-campaign'; payload: { campaign: any } }
  | { type: 'campaign-ended'; payload: { reason: 'numbers-exhausted' | 'stopped' } }
  | { type: 'message'; payload: any }
  | { type: 'call-connected'; payload: { callId: number; phone: string } };

interface UseAdminSocketOptions {
  operatorId: number | null;
  onCommand: (cmd: AdminCommand) => void;
  onReconnect?: () => void;
}

export function useAdminSocket({ operatorId, onCommand, onReconnect }: UseAdminSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!operatorId) return;

    const backendBase =
      typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : 'http://localhost:3001';

    const socket = io(`${backendBase}/ws`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socketRef.current = socket;
    let firstConnect = true;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('register', { operatorId: String(operatorId) });
      if (!firstConnect) {
        // Backend restarted or network recovered — re-announce availability
        onReconnectRef.current?.();
      }
      firstConnect = false;
    });

    socket.on('reconnect', () => {
      socket.emit('register', { operatorId: String(operatorId) });
      onReconnectRef.current?.();
    });

    socket.on('admin:command', (cmd: AdminCommand) => {
      onCommandRef.current(cmd);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [operatorId]);

  return { socketRef, connected };
}
