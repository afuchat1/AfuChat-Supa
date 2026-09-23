import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetProject,
  useListApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  getListApiKeysQueryKey,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';

const SCOPES = ['images:read', 'images:write', 'images:delete', 'projects:read'];
const ENV_COLORS: Record<string, string> = {
  development: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  production: 'bg-green-100 text-green-700 border-green-200',
  testing: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function ProjectApiKeysPage() {
  const params = useParams();
  const projectId = params.id!;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnv, setNewKeyEnv] = useState('development');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['images:read', 'images:write']);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: project } = useGetProject(projectId);
  const { data: keys = [], isLoading } = useListApiKeys(projectId);
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createMutation.mutate(
      { projectId, data: { name: newKeyName, environment: newKeyEnv as any, scopes: newKeyScopes } },
      {
        onSuccess: (data: any) => {
          setCreatedSecret(data.secret);
          setShowCreate(false);
          setNewKeyName('');
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey(projectId) });
        },
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const handleRevoke = (keyId: string, keyName: string) => {
    if (!confirm(`Revoke API key "${keyName}"? This cannot be undone.`)) return;
    revokeMutation.mutate(
      { projectId, id: keyId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey(projectId) });
          toast({ title: 'API key revoked', description: `"${keyName}" has been permanently revoked` });
        },
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="space-y-6">
      <Link href={`/projects/${projectId}`}>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to {project?.name || 'Project'}
        </Button>
      </Link>

      <PageHeader
        title="API Keys"
        description={`Manage API keys for ${project?.name || 'this project'}`}
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create API Key
          </Button>
        }
      />

      {/* Revealed secret — show once */}
      {createdSecret && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2 shrink-0 mt-0.5">
              <Key className="h-4 w-4 text-amber-600" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Save your API key now</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This is the only time you'll see this key. Store it somewhere safe.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-foreground overflow-hidden">
              {secretVisible ? createdSecret : '•'.repeat(Math.min(createdSecret.length, 48))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setSecretVisible(v => !v)}
            >
              {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleCopy(createdSecret)}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-amber-700 hover:text-amber-900 h-7"
            onClick={() => setCreatedSecret(null)}
          >
            I've saved my key, dismiss this
          </Button>
        </div>
      )}

      {/* Keys table */}
      <div className="rounded-lg border border-card-border bg-card">
        {isLoading ? (
          <div className="space-y-px p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Key className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">No API keys yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first key to start making API requests</p>
            <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Create API Key
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Environment</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Prefix</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Scopes</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Last used</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {(keys as any[]).map((key: any) => (
                <tr key={key.id} className="border-b border-card-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-foreground">{key.name}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${ENV_COLORS[key.environment] || 'bg-muted text-muted-foreground'}`}>
                      {key.environment}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-foreground">
                      {key.prefix}…
                    </code>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {(key.scopes || []).map((s: string) => (
                        <span key={s} className="rounded bg-primary/8 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{formatDate(key.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(key.id, key.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Help */}
      <div className="rounded-lg border border-card-border bg-card p-5 text-sm text-muted-foreground leading-relaxed space-y-1">
        <p className="font-medium text-foreground text-xs uppercase tracking-wider">Usage</p>
        <p>Include your API key in the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Authorization</code> header:</p>
        <code className="block rounded bg-muted px-3 py-2 font-mono text-xs mt-2">
          Authorization: Bearer {'<your-api-key>'}
        </code>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5 mt-2">
            <div className="space-y-2">
              <Label htmlFor="keyName">Key name</Label>
              <Input
                id="keyName"
                placeholder="e.g. Production server"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={newKeyEnv} onValueChange={setNewKeyEnv}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                {SCOPES.map(scope => (
                  <label
                    key={scope}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
                      newKeyScopes.includes(scope)
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={newKeyScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                      newKeyScopes.includes(scope) ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {newKeyScopes.includes(scope) && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
                    </span>
                    <code>{scope}</code>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || !newKeyName.trim()}>
                {createMutation.isPending ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
