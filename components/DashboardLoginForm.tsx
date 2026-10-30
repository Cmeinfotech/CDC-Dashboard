"use client";

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react';

export default function DashboardLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof result.error === 'string' ? result.error : 'Sign-in failed. Try again.');
        return;
      }
      const requested = new URLSearchParams(window.location.search).get('next') || '/';
      const target = new URL(requested, window.location.origin);
      window.location.replace(target.origin === window.location.origin && !target.pathname.startsWith('/login') ? `${target.pathname}${target.search}${target.hash}` : '/');
    } catch {
      setError('Could not connect. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="dashboard-username">Username</label>
    <div className="auth-input-wrap"><UserRound size={17} aria-hidden="true" /><input id="dashboard-username" name="username" autoComplete="username" required maxLength={128} value={username} onChange={(event) => setUsername(event.target.value)} /></div>
    <label htmlFor="dashboard-password">Password</label>
    <div className="auth-input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="dashboard-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}{!submitting && <ArrowRight size={17} aria-hidden="true" />}</button>
  </form>;
}
