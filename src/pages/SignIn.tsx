// DEMO SIGN-IN. Not secure. The Qlik Cloud tenant handles real authentication.

import { useState, type FormEvent } from 'react';
import { BRAND } from '../config/brand';
import { DEMO_USERS } from '../config/users';

export function SignIn({ onSignIn }: { onSignIn: (displayName: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const u = DEMO_USERS.find((x) => x.username === username.trim() && x.password === password);
    if (!u) { setError('The user name or password is not correct.'); return; }
    onSignIn(u.displayName);
  };

  return (
    <main className="signin">
      <form className="signin-card" onSubmit={submit} aria-labelledby="signin-title">
        <div className="wordmark big"><span className="mark" aria-hidden="true" />{BRAND.name}</div>
        <h1 id="signin-title">{BRAND.product}</h1>
        <label className="field">User name
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary wide">Sign in</button>
        <div className="demo-note">
          <strong>Prototype with synthetic data.</strong> Demo account: <code>analyst</code> / <code>demo2026</code>.
          This sign-in is not secure. It is a placeholder for the Qlik Cloud tenant sign-in.
        </div>
      </form>
    </main>
  );
}
