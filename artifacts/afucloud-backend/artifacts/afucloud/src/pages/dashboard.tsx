import { Link } from 'wouter';
import { useGetAnalyticsOverview, useListActivity, useListProjects } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { formatBytes, formatNumber, formatDateTime } from '@/lib/utils';
import { Database, HardDrive, Activity as ActivityIcon, Zap, ArrowRight, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useGetAnalyticsOverview();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const { data: activity, isLoading: activityLoading } = useListActivity({ limit: '5' });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Monitor your platform usage and recent activity"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-lg border border-card-border bg-card animate-pulse" />
            ))}
          </>
        ) : (
          <>
            <StatCard
              label="Total Images"
              value={formatNumber(overview?.totalImages || 0)}
              icon={Database}
            />
            <StatCard
              label="Storage Used"
              value={formatBytes(overview?.totalStorageUsed || 0)}
              icon={HardDrive}
            />
            <StatCard
              label="API Requests"
              value={formatNumber(overview?.totalApiRequests || 0)}
              icon={Zap}
            />
            <StatCard
              label="Projects"
              value={overview?.totalProjects || 0}
              icon={FolderOpen}
            />
          </>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="gap-1.5" data-testid="button-view-all-projects">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="rounded-lg border border-card-border bg-card">
            {projectsLoading ? (
              <div className="divide-y divide-border">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="divide-y divide-border">
                {projects.slice(0, 5).map((project, index) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block p-4 hover:bg-accent/50 transition-colors"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm text-card-foreground truncate">
                          {project.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {project.imageCount || 0} images · {formatBytes(project.storageUsed || 0)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No projects yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Link href="/activity">
              <Button variant="ghost" size="sm" className="gap-1.5" data-testid="button-view-all-activity">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="rounded-lg border border-card-border bg-card">
            {activityLoading ? (
              <div className="divide-y divide-border">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 animate-pulse">
                    <div className="h-3 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-2.5 bg-muted rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="divide-y divide-border">
                {activity.map((log, index) => (
                  <div
                    key={log.id}
                    className="p-4 hover:bg-accent/50 transition-colors"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <p className="text-sm text-card-foreground">
                      <span className="font-medium">{log.action}</span> on {log.resource}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <ActivityIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No activity yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
