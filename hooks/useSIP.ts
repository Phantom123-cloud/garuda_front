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
  }, []);

  const register = useCallback((config: SipConfig) => {
    if (uaRef.current) {
      uaRef.current.stop();
      uaRef.current = null;
    }

    JsSIP.debug.disable('JsSIP:*');

    const wsPort = config.asteriskWsPort ?? 8088;
    // On HTTPS pages use wss:// through nginx proxy (/ws → Asterisk:8088)
    // On HTTP (dev) connect directly to Asterisk
    const wsUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? `wss://${window.location.host}/ws`
      : `ws://${config.asteriskHost}:${wsPort}/ws`;
    const socket = new JsSIP.WebSocketInterface(wsUrl);

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.extension}@${config.asteriskHost}`,
      password: config.sipPassword,
      display_name: `Operator ${config.extension}`,
      register: true,
      register_expires: 300,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
    } as any);

    ua.on('connecting', () => setStatus('connecting'));
    ua.on('connected', () => setStatus('connecting'));
    ua.on('registered', () => setStatus('registered'));
    ua.on('unregistered', () => setStatus('idle'));
    ua.on('registrationFailed', (e: any) => {
      console.error('SIP registration failed', e);
      setStatus('error');
    });
    ua.on('disconnected', () => {
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const options: any = {
        mediaConstraints: { audio: true, video: false },
        mediaStream: stream,
        pcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
              urls: [
                'turn:188.137.254.172:3478?transport=udp',
                'turn:188.137.254.172:3478?transport=tcp',
              ],
              username: 'ats',
              credential: 'atspassword123',
            },
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
