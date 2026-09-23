import { Link } from 'wouter';
import { Database } from 'lucide-react';

export function AuthHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
          <Database className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold tracking-tight">AfuCloud</span>
      </Link>
      <nav className="flex items-center gap-3 text-xs text-muted-foreground" aria-label="Account navigation">
        <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
        <Link href="/roadmap" className="transition-colors hover:text-foreground">Roadmap</Link>
      </nav>
    </div>
  );
}