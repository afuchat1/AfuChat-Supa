import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetProject,
  useListWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  getListWebhooksQueryKey,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Webhook, Plus, Trash2, Pencil, Check, AlertCircle } from 'lucide-react';

const WEBHOOK_EVENTS = [
  { value: 'image.uploaded', label: 'Image uploaded' },
  { value: 'image.updated', label: 'Image updated' },
  { value: 'image.deleted', label: 'Image deleted' },
  { value: 'project.created', label: 'Project created' },
  { value: 'token.created', label: 'Token created' },
  { value: 'token.revoked', label: 'Token revoked' },
];

interface WebhookFormState {
  url: string;
  events: string[];
  secret: string;
}

const defaultForm: WebhookFormState = { url: '', events: [], secret: '' };

export default function ProjectWebhooksPage() {
  const params = useParams();
  const projectId = params.id!;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WebhookFormState>(defaultForm);

  const { data: project } = useGetProject(projectId);
  const { data: webhooks = [], isLoading } = useListWebhooks(projectId);
  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();

  const openCreate = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowCreate(true);
  };

  const openEdit = (wh: any) => {
    setForm({ url: wh.url, events: wh.events ?? [], secret: '' });
    setEditingId(wh.id);
    setShowCreate(true);
  };

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim() || form.events.length === 0) return;

    if (editingId) {
      updateMutation.mutate(
        { projectId, id: editingId, data: { url: form.url, events: form.events, active: true, ...(form.secret ? { secret: form.secret } : {}) } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey(projectId) });
            setShowCreate(false);
            toast({ title: 'Webhook updated' });
          },
          onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
        }
      );
    } else {
      createMutation.mutate(
        { projectId, data: { url: form.url, events: form.events, ...(form.secret ? { secret: form.secret } : {}) } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey(projectId) });
            setShowCreate(false);
            toast({ title: 'Webhook created' });
          },
          onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
        }
      );
    }
  };

  const handleToggleActive = (wh: any) => {
    updateMutation.mutate(
      { projectId, id: wh.id, data: { active: !wh.active } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey(projectId) }),
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const handleDelete = (id: string, url: string) => {
    if (!confirm(`Delete webhook for "${url}"?`)) return;
    deleteMutation.mutate(
      { projectId, id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey(projectId) });
          toast({ title: 'Webhook deleted' });
        },
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <Link href={`/projects/${projectId}`}>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to {project?.name || 'Project'}
        </Button>
      </Link>

      <PageHeader
        title="Webhooks"
        description={`Receive real-time event notifications for ${project?.name || 'this project'}`}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Webhook
          </Button>
        }
      />

      {/* Info */}
      <div className="rounded-lg border border-card-border bg-card p-4 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Webhooks send signed POST requests to your endpoint when events occur.
          Each payload includes a <code className="rounded bg-muted px-1 font-mono">X-AfuCloud-Signature</code> header for verification.
          Failed deliveries are retried up to 3 times with exponential backoff.
        </p>
      </div>

      {/* Webhooks list */}
      <div className="rounded-lg border border-card-border bg-card divide-y divide-card-border">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : (webhooks as any[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Webhook className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">No webhooks yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Add a webhook to receive real-time event notifications</p>
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Add Webhook
            </Button>
          </div>
        ) : (
          (webhooks as any[]).map((wh: any) => (
            <div key={wh.id} className="p-5 flex items-start gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono text-foreground truncate">{wh.url}</code>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    wh.active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${wh.active ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
                    {wh.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(wh.events || []).map((ev: string) => (
                    <span key={ev} className="rounded-full bg-primary/8 border border-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary">
                      {ev}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Created {formatDate(wh.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleToggleActive(wh)}
                >
                  {wh.active ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => openEdit(wh)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(wh.id, wh.url)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Webhook' : 'Add Webhook'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Endpoint URL</Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://your-server.com/webhooks/afucloud"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Events to send</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map(ev => (
                  <label
                    key={ev.value}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
                      form.events.includes(ev.value)
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={form.events.includes(ev.value)}
                      onChange={() => toggleEvent(ev.value)}
                    />
                    <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                      form.events.includes(ev.value) ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {form.events.includes(ev.value) && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
                    </span>
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhookSecret">
                Signing secret <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="webhookSecret"
                type="password"
                placeholder="Used to sign payloads for verification"
                value={form.secret}
                onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={isPending || !form.url.trim() || form.events.length === 0}
              >
                {isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add webhook'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
