import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  description?: string;
  trend?: {
    value: string;
    positive: boolean;
  };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, description, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-card-border bg-card p-5 transition-colors hover:border-border',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-semibold text-card-foreground">{value}</p>
          {trend && (
            <p
              className={cn(
                'text-xs font-medium',
                trend.positive ? 'text-primary' : 'text-destructive'
              )}
            >
              {trend.value}
            </p>
          )}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {Icon && (
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Icon className="h-5 w-5 text-primary" strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
}
