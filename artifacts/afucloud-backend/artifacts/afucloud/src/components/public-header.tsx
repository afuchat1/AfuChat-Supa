import { Link } from 'wouter';
import { Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-[#FAF8F5]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Cloud className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">AfuCloud</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Public navigation">
          <Link href="/#features" className="transition-colors hover:text-foreground">Features</Link>
          <Link href="/#pricing" className="transition-colors hover:text-foreground">Pricing</Link>
          <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
          <Link href="/roadmap" className="transition-colors hover:text-foreground">Roadmap</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}