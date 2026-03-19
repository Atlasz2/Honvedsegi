import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Shield } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = login(username, password);
    if (!result.success) setError(result.error || 'Hiba történt');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center crosshair-bg">
      <div className="mil-modal w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold font-rajdhani tracking-military-wide text-primary">HONVÉD</h1>
          <p className="text-muted-foreground text-sm mt-1 tracking-military uppercase">Katonai Adminisztrációs Rendszer</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Felhasználónév</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-input border border-border px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:border-primary"
              style={{ borderRadius: '2px' }}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Jelszó</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-input border border-border px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:border-primary"
              style={{ borderRadius: '2px' }}
            />
          </div>
          {error && <p className="text-destructive text-sm font-mono">{error}</p>}
          <button type="submit" className="btn-mil-primary w-full py-3">Bejelentkezés</button>
        </form>
      </div>
    </div>
  );
}
