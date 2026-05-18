'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as JsSIP from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';

export type SipStatus = 'idle' | 'connecting' | 'registered' | 'error' | 'calling' | 'in-call';

interface SipConfig {
  extension: string;
  sipPassword: string;
  asteriskHost: string; // e.g. "192.168.0.128"
  asteriskWsPort?: number; // default 8088
}

interface UseSIPReturn {
  status: SipStatus;
  incomingCall: RTCSession | null;
  currentCall: RTCSession | null;
  register: (config: SipConfig) => void;
  unregister: () => void;
  answer: () => void;
  hangup: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export function useSIP(): UseSIPReturn {
  const uaRef = useRef<JsSIP.UA | null>(null);
  const sessionRef = useRef<RTCSession | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const answeringRef = useRef(false); // mutex: prevents double-answer race

  const [status, setStatus] = useState<SipStatus>('idle');
  const [incomingCall, setIncomingCall] = useState<RTCSession | null>(null);
  const [currentCall, setCurrentCall] = useState<RTCSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (sessionRef.current) {
      try { sessionRef.current.terminate(); } catch {}
      sessionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setCurrentCall(null);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    answeringRef.current = false;
  }, []);

  const register = useCallback((config: SipConfig) => {
    if (uaRef.current) {
      uaRef.current.stop();
      uaRef.current = null;
    }

    JsSIP.debug.disable('JsSIP:*');

    // When served over HTTPS — use WSS (nginx proxies wss://host/ws → ws://localhost:8088/ws)
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const wsPort = config.asteriskWsPort ?? 8088;
    const wsUrl = isSecure
      ? `wss://${config.asteriskHost}/ws`
      : `ws://${config.asteriskHost}:${wsPort}/ws`;
    console.log('[useSIP] WebSocket URL:', wsUrl, '| isSecure:', isSecure);
    const socket = new JsSIP.WebSocketInterface(wsUrl);

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.extension}@${config.asteriskHost}`,
      password: config.sipPassword,
      display_name: `Operator ${config.extension}`,
      register: true,
      register_expires: 60,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
    });

    ua.on('connecting', () => setStatus('connecting'));
    ua.on('connected', () => setStatus('connecting'));
    ua.on('registered', () => setStatus('registered'));
    ua.on('unregistered', () => setStatus('idle'));
    ua.on('registrationFailed', (e: any) => {
      console.error('SIP registration failed', e);
      setStatus('error');
    });
    ua.on('disconnected', () => {
      // Clear pending incoming call (can't answer on dead WS),
      // but do NOT terminate active calls — let page.tsx handle state reset
      setIncomingCall(null);
      sessionRef.current = null;
      answeringRef.current = false;
      setStatus('error');
    });

    ua.on('newRTCSession', (data: any) => {
      const session: RTCSession = data.session;

      if (session.direction === 'incoming') {
        sessionRef.current = session;
        setIncomingCall(session);
        setStatus('calling');

        session.on('failed', () => {
          cleanup();
          setStatus('registered');
        });
        session.on('ended', () => {
          cleanup();
          setStatus('registered');
        });
      }
    });

    uaRef.current = ua;
    ua.start();
    setStatus('connecting');
  }, [cleanup]);

  const unregister = useCallback(() => {
    cleanup();
    if (uaRef.current) {
      uaRef.current.stop();
      uaRef.current = null;
    }
    setStatus('idle');
  }, [cleanup]);

  const answer = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    // Mutex: prevent concurrent answer() calls (race condition)
    if (answeringRef.current) {
      console.warn('[useSIP] answer() already in progress, skipping');
      return;
    }
    answeringRef.current = true;

    // JsSIP statuses: 3=INVITE_RECEIVED, 4=WAITING_FOR_ANSWER — only these are answerable
    const sessionStatus = (session as any).status;
    if (sessionStatus !== 3 && sessionStatus !== 4) {
      console.warn('[useSIP] Cannot answer: session status is', sessionStatus, '(expected 3 or 4)');
      answeringRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Re-check session status after async getUserMedia (may have changed)
      const statusAfterMedia = (session as any).status;
      if (statusAfterMedia !== 3 && statusAfterMedia !== 4) {
        console.warn('[useSIP] Session changed during getUserMedia:', statusAfterMedia, '— aborting answer');
        stream.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        answeringRef.current = false;
        return;
      }

      const options: any = {
        mediaConstraints: { audio: true, video: false },
        mediaStream: stream,
        pcConfig: {
          // Asterisk is on a public IP — use STUN to get correct ICE candidates
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
          ],
        },
      };

      session.answer(options);
      setCurrentCall(session);
      setIncomingCall(null);
      setStatus('in-call');

      session.connection?.addEventListener('track', (e: RTCTrackEvent) => {
        if (e.streams && e.streams[0]) {
          setRemoteStream(e.streams[0]);
          if (!remoteAudioRef.current) {
            remoteAudioRef.current = new Audio();
            remoteAudioRef.current.autoplay = true;
          }
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      });

      session.on('ended', () => {
        cleanup();
        setStatus('registered');
      });
      session.on('failed', () => {
        cleanup();
        setStatus('registered');
      });
    } catch (err) {
      console.error('Failed to answer call:', err);
      answeringRef.current = false;
      setStatus('error');
    }
  }, [cleanup]);

  const hangup = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      try { session.terminate(); } catch {}
    }
    cleanup();
    if (uaRef.current?.isRegistered()) {
      setStatus('registered');
    } else {
      setStatus('idle');
    }
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
      if (uaRef.current) {
        uaRef.current.stop();
        uaRef.current = null;
      }
    };
  }, [cleanup]);

  // When the browser tab is backgrounded, JS timers freeze → JsSIP misses
  // its REGISTER refresh → Asterisk drops registration after 60s → no calls.
  // On tab focus restore, force re-register immediately.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const ua = uaRef.current;
      if (!ua) return;
      if (!ua.isConnected()) {
        console.log('[useSIP] Tab visible — restarting UA');
        ua.start();
      } else {
        console.log('[useSIP] Tab visible — refreshing SIP registration');
        try { ua.register(); } catch {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);


  return {
    status,
    incomingCall,
    currentCall,
    register,
    unregister,
    answer,
    hangup,
    localStream,
    remoteStream,
  };
}
