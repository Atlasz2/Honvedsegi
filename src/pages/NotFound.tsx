import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Compass className="w-10 h-10 text-muted-foreground mb-4" />
      <h1 className="text-3xl font-bold font-rajdhani tracking-military-wide text-primary mb-2">404</h1>
      <p className="text-sm text-muted-foreground mb-1">Ez az oldal nem található.</p>
      <p className="text-xs font-mono text-muted-foreground mb-6 break-all">{location.pathname}</p>
      <Link to="/" className="btn-mil-primary text-xs">
        Vissza az áttekintéshez
      </Link>
    </div>
  );
}
