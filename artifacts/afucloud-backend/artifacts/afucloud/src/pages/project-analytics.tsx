import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useGetProject, useGetProjectAnalytics } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatBytes, formatDate } from '@/lib/utils';
import { ArrowLeft, Upload, HardDrive, TrendingUp, Download } from 'lucide-react';

const PERIODS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

const chartConfig = {
  uploads: { label: 'Uploads', color: 'hsl(173, 70%, 35%)' },
  downloads: { label: 'Downloads', color: 'hsl(173, 70%, 55%)' },
};

function formatAxisDate(dateStr: string, period: string) {
  const d = new Date(dateStr);
  if (period === '7d') return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProjectAnalyticsPage() {
  const params = useParams();
  const projectId = params.id!;
  const [period, setPeriod] = useState('30d');

  const { data: project } = useGetProject(projectId);
  const { data: analytics, isLoading } = useGetProjectAnalytics(projectId, { period });

  const dailyStats = analytics?.dailyStats ?? [];
  const chartData = dailyStats.map(d => ({
    ...d,
    date: formatAxisDate(d.date, period),
    rawDate: d.date,
  }));

  // Peak upload day
  const peak = [...dailyStats].sort((a, b) => b.uploads - a.uploads)[0];

  return (
    <div className="space-y-6">
      <Link href={`/projects/${projectId}`}>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to {project?.name || 'Project'}
        </Button>
      </Link>

      <PageHeader
        title="Analytics"
        description={`Usage metrics for ${project?.name || 'this project'}`}
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-card-border bg-card p-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg border border-card-border bg-card animate-pulse" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Uploads"
              value={analytics?.uploads ?? 0}
              icon={Upload}
            />
            <StatCard
              label="Storage Used"
              value={formatBytes(analytics?.storageUsed ?? 0)}
              icon={HardDrive}
            />
            <StatCard
              label="Downloads"
              value={analytics?.downloads ?? 0}
              icon={Download}
            />
            <StatCard
              label="Peak Day"
              value={peak ? `${peak.uploads} uploads` : '—'}
              icon={TrendingUp}
              description={peak ? formatDate(peak.date) : undefined}
            />
          </>
        )}
      </div>

      {/* Upload trend chart */}
      <div className="rounded-lg border border-card-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Upload Activity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Daily image uploads over the selected period</p>
          </div>
        </div>
        {isLoading ? (
          <div className="h-48 rounded bg-muted animate-pulse" />
        ) : chartData.length > 0 && chartData.some(d => d.uploads > 0) ? (
          <ChartContainer config={chartConfig} className="h-52 w-full">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(173, 70%, 35%)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(173, 70%, 35%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval={period === '7d' ? 0 : period === '30d' ? 4 : 8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="hsl(173, 70%, 35%)"
                strokeWidth={2}
                fill="url(#uploadGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="h-48 flex items-center justify-center rounded-lg bg-muted/30">
            <div className="text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No uploads in this period</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Upload images to see activity here</p>
            </div>
          </div>
        )}
      </div>

      {/* Daily breakdown table */}
      {!isLoading && dailyStats.some(d => d.uploads > 0) && (
        <div className="rounded-lg border border-card-border bg-card">
          <div className="px-5 py-4 border-b border-card-border">
            <h3 className="text-sm font-semibold text-foreground">Daily Breakdown</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-card-border">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Uploads</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Downloads</th>
                </tr>
              </thead>
              <tbody>
                {[...dailyStats].reverse().filter(d => d.uploads > 0 || d.downloads > 0).map(d => (
                  <tr key={d.date} className="border-b border-card-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{formatDate(d.date)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{d.uploads}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{d.downloads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
