import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListTokens, useCreateToken, useRevokeToken, getListTokensQueryKey } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { Key, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';

export default function TokensPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const { data: tokens, isLoading } = useListTokens();
  const createMutation = useCreateToken();
  const revokeMutation = useRevokeToken();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { data: { name, description: '', expiresAt: null } },
      {
        onSuccess: (data: any) => {
          setNewToken(data.token);
          queryClient.invalidateQueries({ queryKey: getListTokensQueryKey() });
          setName('');
        },
        onError: (err: any) => {
          toast({ title: 'Failed to create token', description: err.message, variant: 'destructive' });
        },
      }
    );
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({ title: 'Copied', description: 'Token copied to clipboard' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal Access Tokens"
        description="Tokens for authenticating API requests"
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNewToken(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />New Token</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{newToken ? 'Token created' : 'Create Token'}</DialogTitle></DialogHeader>
              {newToken ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Copy this token now — it won't be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs break-all">
                      {showToken ? newToken : '•'.repeat(Math.min(newToken.length, 40))}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setShowToken(!showToken)}>
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyToken(newToken)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button className="w-full" onClick={() => { setOpen(false); setNewToken(null); }}>Done</Button>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="token-name">Token Name</Label>
                    <Input id="token-name" placeholder="e.g. CI/CD Pipeline" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating…' : 'Create Token'}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border border-card-border bg-card divide-y divide-border">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse bg-muted/30" />)
        ) : tokens?.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Key className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No tokens yet</p>
          </div>
        ) : (
          tokens?.map((token: any) => (
            <div key={token.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Key className="h-4 w-4 text-primary" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{token.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{token.prefix}••••••••</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={token.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                  {token.status}
                </Badge>
                {token.lastUsedAt && (
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    Last used {formatDate(token.lastUsedAt)}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => revokeMutation.mutate({ id: token.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
