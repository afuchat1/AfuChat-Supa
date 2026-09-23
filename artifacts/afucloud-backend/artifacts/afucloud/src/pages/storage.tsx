import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBytes, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api-base';
import {
  ChevronRight, Cloud, Copy, File, Folder, FolderPlus, HardDrive, MoreHorizontal,
  Pencil, Plus, RefreshCw, Settings2, Trash2, Upload, X,
} from 'lucide-react';

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('afucloud_token') ?? ''}`,
  'Content-Type': 'application/json',
});

type Container = {
  id: string; name: string; slug: string; description?: string | null;
  accessMode: string; cdnEnabled: boolean; cdnHostnameId?: string | null;
  cdnStatus: string; objectCount: number; storageUsed: number; cdnUrl?: string | null;
};
type StorageObject = {
  id: string; key: string; name: string; contentType?: string | null;
  size: number; etag?: string | null; isFolder: boolean; url?: string | null;
  createdAt: string; updatedAt: string;
};
type Domain = { id: string; hostname: string; verificationStatus: string; hostnames: Array<{ id: string; hostname: string; service: string; status: string }> };

async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function StoragePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameObject, setRenameObject] = useState<StorageObject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [detailsObject, setDetailsObject] = useState<StorageObject | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cdnHostId, setCdnHostId] = useState('');
  const [accessMode, setAccessMode] = useState('private');
  const [busy, setBusy] = useState<string | null>(null);

  const { data: containers = [], isLoading } = useQuery<Container[]>({
    queryKey: ['storage-containers'],
    queryFn: () => jsonFetch('/v1/storage-containers'),
  });
  const selected = containers.find(container => container.id === selectedId) ?? containers[0];
  const { data: objectData, isLoading: objectsLoading } = useQuery<{ prefix: string; objects: StorageObject[] }>({
    queryKey: ['storage-objects', selected?.id, prefix],
    queryFn: () => jsonFetch(`/v1/storage-containers/${selected!.id}/objects?prefix=${encodeURIComponent(prefix)}`),
    enabled: !!selected,
  });
  const { data: domains = [] } = useQuery<Domain[]>({
    queryKey: ['domains'],
    queryFn: () => jsonFetch('/v1/domains'),
  });

  const cdnHostnames = useMemo(() => domains.flatMap(domain =>
    domain.verificationStatus === 'verified'
      ? domain.hostnames.filter(hostname => hostname.service === 'cdn').map(hostname => ({ ...hostname, domain: domain.hostname }))
      : [],
  ), [domains]);

  useEffect(() => {
    if (selected) {
      setAccessMode(selected.accessMode);
      setCdnHostId(selected.cdnHostnameId ?? '');
    }
  }, [selected?.id, selected?.accessMode, selected?.cdnHostnameId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['storage-containers'] });
    queryClient.invalidateQueries({ queryKey: ['storage-objects', selected?.id] });
  };
  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    try { await action(); invalidate(); toast({ title: success }); }
    catch (error) { toast({ title: 'Action failed', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const createContainer = async (event: React.FormEvent) => {
    event.preventDefault();
    await run('create', async () => {
      const created = await jsonFetch('/v1/storage-containers', { method: 'POST', body: JSON.stringify({ name: containerName }) });
      setSelectedId(created.id);
      setContainerName('');
      setCreateOpen(false);
    }, 'Container created');
  };

  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    await run('folder', async () => {
      const name = prefix ? `${prefix}/${folderName}` : folderName;
      await jsonFetch(`/v1/storage-containers/${selected.id}/folders`, { method: 'POST', body: JSON.stringify({ name }) });
      setFolderName('');
      setFolderOpen(false);
    }, 'Folder created');
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setBusy('upload');
    try {
      for (const file of Array.from(files)) {
        const name = prefix ? `${prefix}/${file.name}` : file.name;
        const upload = await jsonFetch(`/v1/storage-containers/${selected.id}/upload-url`, {
          method: 'POST', body: JSON.stringify({ name, contentType: file.type || 'application/octet-stream' }),
        });
        const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!put.ok) throw new Error(`Upload failed for ${file.name}`);
        await jsonFetch(`/v1/storage-containers/${selected.id}/objects/confirm`, {
          method: 'POST',
          body: JSON.stringify({ name, key: upload.key, contentType: file.type, size: file.size, etag: put.headers.get('etag') }),
        });
      }
      invalidate();
      toast({ title: `${files.length} file${files.length === 1 ? '' : 's'} uploaded` });
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const rename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !renameObject) return;
    await run(`rename-${renameObject.id}`, async () => {
      await jsonFetch(`/v1/storage-containers/${selected.id}/objects/${renameObject.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameValue }) });
      setRenameObject(null);
      setDetailsObject(null);
    }, 'Object renamed');
  };

  const removeObject = (object: StorageObject) => {
    if (!selected || !confirm(`Delete ${object.name}?`)) return;
    run(`delete-${object.id}`, async () => {
      await jsonFetch(`/v1/storage-containers/${selected.id}/objects/${object.id}`, { method: 'DELETE' });
      if (detailsObject?.id === object.id) setDetailsObject(null);
    }, 'Object deleted');
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    await run('settings', async () => {
      await jsonFetch(`/v1/storage-containers/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ accessMode }) });
      await jsonFetch(`/v1/storage-containers/${selected.id}/cdn`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: Boolean(cdnHostId), hostnameId: cdnHostId }),
      });
      setSettingsOpen(false);
    }, 'Container settings saved');
  };

  const deleteContainer = () => {
    if (!selected || !confirm(`Delete ${selected.name} and all of its objects?`)) return;
    run('delete-container', async () => {
      await jsonFetch(`/v1/storage-containers/${selected.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setPrefix('');
    }, 'Container deleted');
  };

  const folders = prefix ? prefix.split('/') : [];
  const objects = objectData?.objects ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="CDN / Storage"
        description="Manage R2-backed storage containers and delivery settings"
        actions={<Button className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New container</Button>}
      />

      {isLoading ? <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-40 animate-pulse rounded-lg border border-card-border bg-card" />)}</div> : containers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center"><HardDrive className="mx-auto h-10 w-10 text-muted-foreground/40" /><h2 className="mt-4 font-semibold">No storage containers yet</h2><p className="mt-1 text-sm text-muted-foreground">Create a container to organize files and connect a verified CDN hostname.</p><Button className="mt-5 gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create container</Button></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-3">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Containers</p><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /></Button></div>
            <div className="space-y-1.5">{containers.map(container => <button key={container.id} onClick={() => { setSelectedId(container.id); setPrefix(''); }} className={cn('w-full rounded-lg border px-3 py-3 text-left transition-colors', selected?.id === container.id ? 'border-primary bg-primary/5' : 'border-card-border bg-card hover:border-border')}><div className="flex items-center gap-2"><HardDrive className={cn('h-4 w-4', selected?.id === container.id ? 'text-primary' : 'text-muted-foreground')} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{container.name}</span></div><div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{container.objectCount} objects</span><span>{formatBytes(container.storageUsed)}</span></div><div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">{container.cdnEnabled ? <><Cloud className="h-3 w-3 text-primary" />CDN {container.cdnStatus}</> : 'CDN disabled'}</div></button>)}</div>
          </aside>

          {selected && <section className="min-w-0 rounded-lg border border-card-border bg-card">
            <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-primary" /><h2 className="font-semibold">{selected.name}</h2></div><p className="mt-1 text-xs text-muted-foreground">{selected.description || 'R2 storage container'} · {formatBytes(selected.storageUsed)} used</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="gap-2" onClick={() => setSettingsOpen(true)}><Settings2 className="h-3.5 w-3.5" />Settings</Button><Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}><Upload className="h-3.5 w-3.5" />{busy === 'upload' ? 'Uploading…' : 'Upload'}</Button><input ref={fileRef} type="file" multiple className="hidden" onChange={event => uploadFiles(event.target.files)} /></div></div>
            {selected.cdnEnabled && <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-3 text-xs"><Cloud className="h-3.5 w-3.5 text-primary" /><span className="font-medium">CDN delivery</span><span className="text-muted-foreground">{selected.cdnUrl || 'Hostname pending DNS activation'}</span><span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">{selected.cdnStatus}</span></div>}
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3"><div className="flex min-w-0 items-center gap-1 text-xs"><button className="text-muted-foreground hover:text-foreground" onClick={() => setPrefix('')}>Root</button>{folders.map((folder, index) => <span key={`${folder}-${index}`} className="flex items-center gap-1"><ChevronRight className="h-3 w-3 text-muted-foreground/50" /><button className="truncate text-muted-foreground hover:text-foreground" onClick={() => setPrefix(folders.slice(0, index + 1).join('/'))}>{folder}</button></span>)}</div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setFolderOpen(true)}><FolderPlus className="h-3.5 w-3.5" />Folder</Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => queryClient.invalidateQueries({ queryKey: ['storage-objects', selected.id] })}><RefreshCw className="h-3.5 w-3.5" /></Button></div></div>
             {objectsLoading ? <div className="space-y-2 p-5">{[1, 2, 3].map(item => <div key={item} className="h-12 animate-pulse rounded border border-border bg-muted/30" />)}</div> : objects.length === 0 ? <div className="px-5 py-16 text-center"><Folder className="mx-auto h-9 w-9 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">This folder is empty</p><Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" />Upload files</Button></div> : <div className="divide-y divide-border">{objects.map(object => <div key={object.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">{object.isFolder ? <Folder className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-muted-foreground" />}</div><button className="min-w-0 flex-1 text-left" onClick={() => object.isFolder ? setPrefix(object.key) : setDetailsObject(object)}><p className="truncate text-sm font-medium">{object.name}</p><p className="truncate text-[11px] text-muted-foreground">{object.isFolder ? 'Folder' : `${object.contentType || 'File'} · ${formatBytes(object.size)}`}</p></button><span className="hidden text-xs text-muted-foreground sm:block">{formatDate(object.updatedAt)}</span>{!object.isFolder && object.url && <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={object.url} target="_blank" rel="noreferrer"><Copy className="h-3.5 w-3.5" /></a></Button>}<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setRenameObject(object); setRenameValue(object.name); }}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeObject(object)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
          </section>}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Create storage container</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={createContainer}><div className="space-y-2"><Label htmlFor="container-name">Name</Label><Input id="container-name" value={containerName} onChange={event => setContainerName(event.target.value)} placeholder="product-images" required /></div><p className="text-xs text-muted-foreground">Objects will be stored in the existing AfuCloud R2 bucket under an isolated container prefix.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create container'}</Button></div></form></DialogContent></Dialog>
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}><DialogContent><DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={createFolder}><div className="space-y-2"><Label htmlFor="folder-name">Folder name</Label><Input id="folder-name" value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="campaign-2026" required /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setFolderOpen(false)}>Cancel</Button><Button type="submit" disabled={busy === 'folder'}>{busy === 'folder' ? 'Creating…' : 'Create folder'}</Button></div></form></DialogContent></Dialog>
      <Dialog open={!!renameObject} onOpenChange={open => !open && setRenameObject(null)}><DialogContent><DialogHeader><DialogTitle>Rename {renameObject?.isFolder ? 'folder' : 'object'}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={rename}><div className="space-y-2"><Label htmlFor="rename-value">Name</Label><Input id="rename-value" value={renameValue} onChange={event => setRenameValue(event.target.value)} required /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRenameObject(null)}>Cancel</Button><Button type="submit">Save name</Button></div></form></DialogContent></Dialog>
      <Dialog open={!!detailsObject} onOpenChange={open => !open && setDetailsObject(null)}><DialogContent><DialogHeader><DialogTitle>Object details</DialogTitle></DialogHeader>{detailsObject && <div className="space-y-4"><div className="rounded-lg border border-border bg-muted/30 p-4"><p className="font-medium">{detailsObject.name}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{detailsObject.key}</p></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Content type</dt><dd className="mt-1">{detailsObject.contentType || 'Unknown'}</dd></div><div><dt className="text-xs text-muted-foreground">Size</dt><dd className="mt-1">{formatBytes(detailsObject.size)}</dd></div><div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1">{formatDate(detailsObject.createdAt)}</dd></div><div><dt className="text-xs text-muted-foreground">Updated</dt><dd className="mt-1">{formatDate(detailsObject.updatedAt)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">ETag</dt><dd className="mt-1 break-all font-mono text-xs">{detailsObject.etag || 'Not provided'}</dd></div></dl><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { navigator.clipboard.writeText(detailsObject.key); toast({ title: 'Object key copied' }); }} className="gap-2"><Copy className="h-3.5 w-3.5" />Copy key</Button>{detailsObject.url && <Button asChild className="gap-2"><a href={detailsObject.url} target="_blank" rel="noreferrer">Open object</a></Button>}</div></div>}</DialogContent></Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><DialogHeader><DialogTitle>Container settings</DialogTitle></DialogHeader><form className="space-y-5" onSubmit={saveSettings}><div className="space-y-2"><Label htmlFor="access-mode">Access settings</Label><select id="access-mode" value={accessMode} onChange={event => setAccessMode(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="private">Private — signed delivery only</option><option value="public">Public — anyone with a URL</option></select></div><div className="space-y-2"><Label htmlFor="cdn-hostname">Custom CDN hostname</Label><select id="cdn-hostname" value={cdnHostId} onChange={event => setCdnHostId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Disabled</option>{cdnHostnames.map(hostname => <option key={hostname.id} value={hostname.id}>{hostname.hostname} · {hostname.status}</option>)}</select>{cdnHostnames.length === 0 && <p className="text-xs text-muted-foreground">Add and verify a hostname with the CDN service in Domains first.</p>}</div><div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">AfuCloud keeps R2 credentials server-side. The production delivery URL uses the selected verified hostname instead of exposing the R2 endpoint.</div>{selected && <Button type="button" variant="ghost" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={deleteContainer}><Trash2 className="h-3.5 w-3.5" />Delete container</Button>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button type="submit" disabled={busy === 'settings'}>{busy === 'settings' ? 'Saving…' : 'Save settings'}</Button></div></form></DialogContent></Dialog>
    </div>
  );
}