import { useState } from 'react';
import { useGetAnalyticsOverview } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatBytes, formatNumber, formatDate } from '@/lib/utils';
import { Database, HardDrive, Zap, FolderOpen, Upload, TrendingUp } from 'lucide-react';

const chartConfig = {
  uploads: { label: 'Uploads', color: 'hsl(173, 70%, 35%)' },
  storage: { label: 'Storage (MB)', color: 'hsl(173, 70%, 50%)' },
};

export default function AnalyticsPage() {
  const { data: overview, isLoading } = useGetAnalyticsOverview();

  // Build a simple sparkline for recent uploads using recentUploads
  const recentUploads = overview?.recentUploads ?? 0;

  // Simulated last-7-days distribution for the sparkline (actual per-day data requires project-level endpoint)
  const placeholderChartMsg = recentUploads === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Platform-wide usage metrics across all your projects"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg border border-card-border bg-card animate-pulse" />
          ))
        ) : (
          <>
            <StatCard label="Total Images" value={formatNumber(overview?.totalImages ?? 0)} icon={Database} />
            <StatCard label="Storage Used" value={formatBytes(overview?.totalStorageUsed ?? 0)} icon={HardDrive} />
            <StatCard label="API Requests" value={formatNumber(overview?.totalApiRequests ?? 0)} icon={Zap} />
            <StatCard label="Projects" value={overview?.totalProjects ?? 0} icon={FolderOpen} />
          </>
        )}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent uploads */}
        <div className="rounded-lg border border-card-border bg-card p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent Uploads (7 days)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Images uploaded across all projects this week</p>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold tracking-tight text-foreground">
              {isLoading ? '—' : formatNumber(overview?.recentUploads ?? 0)}
            </span>
            <div className="flex items-center gap-1 pb-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>this week</span>
            </div>
          </div>
          {!isLoading && !placeholderChartMsg && (
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (recentUploads / Math.max(overview?.totalImages ?? 1, 1)) * 100 * 5)}%` }}
              />
            </div>
          )}
          {!isLoading && placeholderChartMsg && (
            <p className="text-xs text-muted-foreground">No uploads in the last 7 days. Upload images to see activity here.</p>
          )}
        </div>

        {/* Storage breakdown */}
        <div className="rounded-lg border border-card-border bg-card p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Storage Overview</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Total storage consumed across all projects</p>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold tracking-tight text-foreground">
              {isLoading ? '—' : formatBytes(overview?.totalStorageUsed ?? 0)}
            </span>
          </div>
          {!isLoading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Used</span>
                <span>{formatBytes(overview?.totalStorageUsed ?? 0)} / 5 GB</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, ((overview?.totalStorageUsed ?? 0) / (5 * 1024 * 1024 * 1024)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-project hint */}
      <div className="rounded-lg border border-card-border bg-card p-5 flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
          <TrendingUp className="h-5 w-5 text-primary" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Per-project analytics</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-lg leading-relaxed">
            For detailed upload trend charts, bandwidth usage, and daily breakdowns, open any project and click the{' '}
            <strong>Analytics</strong> button in the project header.
          </p>
        </div>
      </div>
    </div>
  );
}
