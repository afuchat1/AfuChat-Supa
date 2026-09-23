import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="break-words text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end [&>div]:max-w-full [&>div]:flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
