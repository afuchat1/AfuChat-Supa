import { useListActivity } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { formatDateTime } from '@/lib/utils';
import { Activity as ActivityIcon, Upload, Trash2, Edit, Key, FolderOpen } from 'lucide-react';

const actionIcons: Record<string, React.ElementType> = {
  upload: Upload,
  delete: Trash2,
  update: Edit,
  create: FolderOpen,
  token: Key,
};

export default function ActivityPage() {
  const { data: activity, isLoading } = useListActivity({ limit: '50' });

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Recent actions across all your projects" />

      <div className="rounded-lg border border-card-border bg-card divide-y divide-border">
        {isLoading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-48 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
            </div>
          ))
        ) : activity?.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ActivityIcon className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No activity yet</p>
          </div>
        ) : (
          activity?.map((item: any) => {
            const Icon = actionIcons[item.action] ?? ActivityIcon;
            return (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
