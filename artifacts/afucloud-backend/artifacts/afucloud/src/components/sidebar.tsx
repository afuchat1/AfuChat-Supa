import { useLocation, Link } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  Activity,
  Key,
  Settings,
  BookOpen,
  Cloud,
  LogOut,
  X,
  Map,
  Globe2,
  HardDrive,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Activity', href: '/activity', icon: Activity },
  { name: 'Tokens', href: '/tokens', icon: Key },
  { name: 'Domains', href: '/domains', icon: Globe2 },
  { name: 'CDN / Storage', href: '/storage', icon: HardDrive },
];

const bottomNav = [
  { name: 'Roadmap', href: '/roadmap', icon: Map },
  { name: 'Docs', href: '/docs', icon: BookOpen },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  /** Mobile only — whether the drawer is open */
  open?: boolean;
  /** Mobile only — called when the user closes the drawer */
  onClose?: () => void;
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe({ query: { queryKey: ['/api/v1/auth/me'], retry: false } });
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem('afucloud_token');
        localStorage.removeItem('afucloud_refresh_token');
        setLocation('/login');
      },
    });
  };

  const handleNavClick = () => {
    // Close drawer on mobile after navigating
    onClose?.();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Cloud className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            AfuCloud
          </span>
        </div>
        {/* Close button — only visible on mobile */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden rounded-md p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          Platform
        </p>
        {navigation.map((item) => {
          const isActive =
            location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isActive ? 'opacity-100' : 'opacity-70'
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {item.name}
            </Link>
          );
        })}

        <div className="my-3 border-t border-sidebar-border/60" />

        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          Account
        </p>
        {bottomNav.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon
                className={cn('h-4 w-4 shrink-0', isActive ? 'opacity-100' : 'opacity-70')}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {user?.name ?? 'Loading…'}
            </p>
            <p className="text-[11px] text-sidebar-foreground/55 truncate">
              {user?.email ?? ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors disabled:opacity-50"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar (always visible ≥ lg) ── */}
      <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-72 border-r border-sidebar-border bg-sidebar transition-transform duration-250 ease-in-out lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent onClose={onClose} />
      </aside>
    </>
  );
}
