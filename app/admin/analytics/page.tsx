'use client';
import { useEffect } from 'react';
import { useWsNav } from '@/lib/use-ws-nav';

export default function AnalyticsRedirect() {
  const { replace } = useWsNav();
  useEffect(() => { replace('/admin/reports'); }, []);
  return null;
}
