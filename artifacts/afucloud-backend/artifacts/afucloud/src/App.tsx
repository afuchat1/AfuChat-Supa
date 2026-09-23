import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from 'next-themes';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { AuthGuard } from '@/components/auth-guard';
import { Sidebar } from '@/components/sidebar';
import { Menu, Cloud } from 'lucide-react';
import LandingPage from '@/pages/landing';
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import DashboardPage from '@/pages/dashboard';
import ProjectsPage from '@/pages/projects';
import ProjectDetailPage from '@/pages/project-detail';
import ProjectApiKeysPage from '@/pages/project-api-keys';
import ProjectWebhooksPage from '@/pages/project-webhooks';
import ProjectAnalyticsPage from '@/pages/project-analytics';
import AnalyticsPage from '@/pages/analytics';
import ActivityPage from '@/pages/activity';
import TokensPage from '@/pages/tokens';
import SettingsPage from '@/pages/settings';
import DocsPage from '@/pages/docs';
import RoadmapPage from '@/pages/roadmap';
import DomainsPage from '@/pages/domains';
import StoragePage from '@/pages/storage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="min-w-0 flex-1 overflow-x-hidden lg:pl-64 min-h-[100dvh]">
        {/* Mobile top bar — hidden on desktop */}
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Cloud className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight">AfuCloud</span>
          </div>
        </header>

        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppLayout>{children}</AppLayout>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      {/* Public pages — no sidebar */}
      <Route path="/docs" component={DocsPage} />
      <Route path="/roadmap" component={RoadmapPage} />

      {/* Protected */}
      <Route path="/dashboard">
        <Protected><DashboardPage /></Protected>
      </Route>
      <Route path="/projects">
        <Protected><ProjectsPage /></Protected>
      </Route>
      <Route path="/projects/:id/api-keys">
        <Protected><ProjectApiKeysPage /></Protected>
      </Route>
      <Route path="/projects/:id/webhooks">
        <Protected><ProjectWebhooksPage /></Protected>
      </Route>
      <Route path="/projects/:id/analytics">
        <Protected><ProjectAnalyticsPage /></Protected>
      </Route>
      <Route path="/projects/:id">
        <Protected><ProjectDetailPage /></Protected>
      </Route>
      <Route path="/analytics">
        <Protected><AnalyticsPage /></Protected>
      </Route>
      <Route path="/activity">
        <Protected><ActivityPage /></Protected>
      </Route>
      <Route path="/tokens">
        <Protected><TokensPage /></Protected>
      </Route>
      <Route path="/domains">
        <Protected><DomainsPage /></Protected>
      </Route>
      <Route path="/storage">
        <Protected><StoragePage /></Protected>
      </Route>
      <Route path="/settings">
        <Protected><SettingsPage /></Protected>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
