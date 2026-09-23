import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useGetProject,
  useGetProjectStats,
  useListImages,
  useToggleImageFavorite,
  getListImagesQueryKey,
  getGetProjectStatsQueryKey,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBytes, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api-base';
import {
  Upload, Image as ImageIcon, HardDrive, Star, Search,
  Trash2, Download, BarChart3, Key, Webhook, ArrowLeft,
  CloudUpload, X, CheckCircle2, AlertCircle, RotateCcw,
  RefreshCw, Check, Tag, FolderOpen, Layers,
} from 'lucide-react';
import type { Image } from '@workspace/api-client-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadItem {
  id: string;
  file: File;
  name: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

type Tab = 'images' | 'trash';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/gif', 'image/avif', 'image/svg+xml', 'image/heic',
];

function authHeaders() {
  const token = localStorage.getItem('afucloud_token') ?? '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.timeout = 5 * 60 * 1000;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status < 300) {
        resolve();
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText);
        reject(new Error(body.error || `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(file);
  });
}

const MAX_ACTIVE_UPLOADS = 3;
let activeUploads = 0;
const waitingUploads: Array<() => void> = [];

function withUploadSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeUploads += 1;
      task().then(resolve, reject).finally(() => {
        activeUploads -= 1;
        const next = waitingUploads.shift();
        if (next) next();
      });
    };
    if (activeUploads < MAX_ACTIVE_UPLOADS) start();
    else waitingUploads.push(start);
  });
}

async function withRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id!;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('images');
  const [search, setSearch] = useState('');
  const [albumFilter, setAlbumFilter] = useState<string | null>(null); // null=All, '__favs'=Favs, string=album
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);

  // ── Bulk select state ─────────────────────────────────────────────────────
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAlbumInput, setBulkAlbumInput] = useState('');
  const [showBulkAlbum, setShowBulkAlbum] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // ── Detail dialog edit state ──────────────────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: project, isLoading: projectLoading } = useGetProject(projectId);
  const { data: stats, isLoading: statsLoading } = useGetProjectStats(projectId);
  const { data: imagesData, isLoading: imagesLoading } = useListImages(projectId, {
    search: search || undefined,
    limit: 200,
  } as any);

  const { data: trashData, isLoading: trashLoading, refetch: refetchTrash } = useQuery({
    queryKey: ['trash', projectId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/v1/projects/${projectId}/images/trash`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load trash');
      return res.json() as Promise<{ images: Image[]; total: number }>;
    },
    enabled: activeTab === 'trash',
  });

  const toggleFavoriteMutation = useToggleImageFavorite();

  // ── Derived ───────────────────────────────────────────────────────────────
  const allImages = imagesData?.images ?? [];

  const albums = useMemo(() => {
    const s = new Set<string>();
    allImages.forEach(img => { if (img.album) s.add(img.album); });
    return Array.from(s).sort();
  }, [allImages]);

  const filteredImages = useMemo(() => {
    if (albumFilter === '__favs') return allImages.filter(img => img.favorite);
    if (albumFilter) return allImages.filter(img => img.album === albumFilter);
    return allImages;
  }, [allImages, albumFilter]);

  const trashImages = trashData?.images ?? [];
  const pendingUploads = uploadQueue.filter(it => it.status !== 'done').length;

  // ── Sync detail dialog state when selectedImage changes ───────────────────
  useEffect(() => {
    if (selectedImage) {
      setEditName(selectedImage.name);
      setEditAlbum(selectedImage.album ?? '');
      setEditTags(selectedImage.tags ?? []);
      setTagInput('');
    }
  }, [selectedImage?.id]);

  // ── Upload logic ──────────────────────────────────────────────────────────
  const updateQueueItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploadQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const uploadFile = useCallback(async (item: UploadItem) => {
    return withUploadSlot(async () => {
      updateQueueItem(item.id, { status: 'uploading', progress: 0 });
      try {
        const urlRes = await withRetry(async () => {
          const response = await fetch(`${API_BASE}/v1/projects/${projectId}/images/upload-url`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              filename: item.file.name,
              contentType: item.file.type || 'application/octet-stream',
              name: item.file.name,
            }),
          });
          if (response.status >= 500) throw new Error(`Upload preparation failed (HTTP ${response.status})`);
          return response;
        });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error(body.error || `Failed to prepare upload (HTTP ${urlRes.status})`);
      }
      const { uploadUrl, imageId, key } = await urlRes.json();
      await withRetry(() => uploadWithProgress(uploadUrl, item.file, (pct) => updateQueueItem(item.id, { progress: Math.round(pct * 0.9) })));
      const confirmRes = await withRetry(async () => {
        const response = await fetch(`${API_BASE}/v1/projects/${projectId}/images/confirm-upload`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ imageId, key, size: item.file.size, originalName: item.file.name, name: item.file.name }),
        });
        if (response.status >= 500) throw new Error(`Upload confirmation failed (HTTP ${response.status})`);
        return response;
      });
      if (!confirmRes.ok) throw new Error(`Failed to confirm upload (HTTP ${confirmRes.status})`);
      updateQueueItem(item.id, { status: 'done', progress: 100 });
      queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey(projectId) });
      } catch (err) {
        updateQueueItem(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      }
    });
  }, [projectId, queryClient, updateQueueItem]);

  const addFiles = useCallback((files: File[] | FileList) => {
    const fileArr = Array.from(files).filter(f => ALLOWED_TYPES.includes(f.type) || f.type.startsWith('image/'));
    if (fileArr.length === 0) {
      toast({ title: 'Unsupported format', description: 'Please upload image files', variant: 'destructive' });
      return;
    }
    const newItems: UploadItem[] = fileArr.map(file => ({
      id: crypto.randomUUID(), file, name: file.name, status: 'uploading' as const, progress: 0,
    }));
    setUploadQueue(prev => [...prev, ...newItems]);
    newItems.forEach(item => uploadFile(item));
  }, [uploadFile, toast]);

  const retryUpload = useCallback((item: UploadItem) => uploadFile(item), [uploadFile]);
  const dismissDoneItems = () => setUploadQueue(prev => prev.filter(it => it.status !== 'done'));

  // ── Clipboard paste ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) { e.preventDefault(); addFiles(files); }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [addFiles]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); };

  // ── Bulk select ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredImages.map(img => img.id)));
  const clearSelection = () => { setSelectedIds(new Set()); setBulkMode(false); setShowBulkAlbum(false); setShowBulkTag(false); };

  const handleBulkDelete = async () => {
    if (!confirm(`Move ${selectedIds.size} image${selectedIds.size !== 1 ? 's' : ''} to the Recycle Bin?`)) return;
    setIsBulkProcessing(true);
    await Promise.allSettled(Array.from(selectedIds).map(id =>
      fetch(`${API_BASE}/v1/projects/${projectId}/images/${id}`, { method: 'DELETE', headers: authHeaders() })
    ));
    queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey(projectId) });
    toast({ title: `${selectedIds.size} images moved to Recycle Bin` });
    clearSelection();
    setIsBulkProcessing(false);
  };

  const handleBulkAlbum = async () => {
    if (!bulkAlbumInput.trim() && bulkAlbumInput !== '') return;
    setIsBulkProcessing(true);
    const album = bulkAlbumInput.trim() || null;
    await Promise.allSettled(Array.from(selectedIds).map(id =>
      fetch(`${API_BASE}/v1/projects/${projectId}/images/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ album }),
      })
    ));
    queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
    toast({ title: album ? `Moved to album "${album}"` : 'Removed from album' });
    setBulkAlbumInput('');
    setShowBulkAlbum(false);
    setIsBulkProcessing(false);
  };

  const handleBulkTag = async () => {
    const tag = bulkTagInput.trim();
    if (!tag) return;
    setIsBulkProcessing(true);
    const images = allImages.filter(img => selectedIds.has(img.id));
    await Promise.allSettled(images.map(img => {
      const newTags = Array.from(new Set([...(img.tags ?? []), tag]));
      return fetch(`${API_BASE}/v1/projects/${projectId}/images/${img.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ tags: newTags }),
      });
    }));
    queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
    toast({ title: `Tag "${tag}" added to ${selectedIds.size} images` });
    setBulkTagInput('');
    setShowBulkTag(false);
    setIsBulkProcessing(false);
  };

  // ── Image actions (single) ────────────────────────────────────────────────
  const handleToggleFavorite = (imageId: string) => {
    toggleFavoriteMutation.mutate(
      { projectId, id: imageId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) }) },
    );
  };

  const handleSoftDelete = async (imageId: string) => {
    if (!confirm('Move this image to the Recycle Bin?')) return;
    try {
      const res = await fetch(`${API_BASE}/v1/projects/${projectId}/images/${imageId}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey(projectId) });
        setSelectedImage(null);
        toast({ title: 'Moved to Recycle Bin' });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Delete failed', description: data.error || `Server returned ${res.status}`, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Delete failed', description: 'Network error — please try again', variant: 'destructive' });
    }
  };

  const handleRestore = async (imageId: string) => {
    try {
      const res = await fetch(`${API_BASE}/v1/projects/${projectId}/images/${imageId}/restore`, { method: 'POST', headers: authHeaders() });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
        queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey(projectId) });
        toast({ title: 'Image restored' });
      } else toast({ title: 'Restore failed', description: 'Please try again', variant: 'destructive' });
    } catch { toast({ title: 'Restore failed', description: 'Network error', variant: 'destructive' }); }
  };

  const handlePermanentDelete = async (imageId: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/v1/projects/${projectId}/images/${imageId}/permanent`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
        toast({ title: 'Permanently deleted' });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Delete failed', description: data.error || `Server returned ${res.status}`, variant: 'destructive' });
      }
    } catch { toast({ title: 'Delete failed', description: 'Network error', variant: 'destructive' }); }
  };

  const handleEmptyTrash = async () => {
    const count = trashData?.images.length ?? 0;
    if (count === 0) return;
    if (!confirm(`Permanently delete all ${count} images in the Recycle Bin? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/v1/projects/${projectId}/images/trash`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
        toast({ title: 'Recycle Bin emptied', description: `${data.count} images permanently deleted` });
      } else toast({ title: 'Failed to empty Recycle Bin', variant: 'destructive' });
    } catch { toast({ title: 'Failed to empty Recycle Bin', description: 'Network error', variant: 'destructive' }); }
  };

  const handleRestoreAll = async () => {
    const images = trashData?.images ?? [];
    if (images.length === 0) return;
    await Promise.all(images.map(img =>
      fetch(`${API_BASE}/v1/projects/${projectId}/images/${img.id}/restore`, { method: 'POST', headers: authHeaders() })
    ));
    queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
    queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey(projectId) });
    toast({ title: `${images.length} images restored` });
  };

  // ── Detail dialog: save name/tags/album ───────────────────────────────────
  const handleSaveImageDetails = async () => {
    if (!selectedImage) return;
    const updates: Record<string, unknown> = {};
    const nameTrimmed = editName.trim();
    if (nameTrimmed && nameTrimmed !== selectedImage.name) updates.name = nameTrimmed;
    const albumTrimmed = editAlbum.trim() || null;
    if (albumTrimmed !== (selectedImage.album ?? null)) updates.album = albumTrimmed;
    const tagsChanged = JSON.stringify(editTags.sort()) !== JSON.stringify((selectedImage.tags ?? []).slice().sort());
    if (tagsChanged) updates.tags = editTags;
    if (Object.keys(updates).length === 0) return;
    setIsSavingDetails(true);
    try {
      const res = await fetch(`${API_BASE}/v1/projects/${projectId}/images/${selectedImage.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(projectId) });
        toast({ title: 'Changes saved' });
        setSelectedImage(prev => prev ? { ...prev, ...updates, tags: (updates.tags ?? prev.tags) as string[], album: (updates.album as string | undefined) ?? prev.album } : null);
      } else toast({ title: 'Failed to save', description: 'Please try again', variant: 'destructive' });
    } catch { toast({ title: 'Failed to save', description: 'Network error', variant: 'destructive' }); }
    setIsSavingDetails(false);
  };

  const handleTagAdd = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || editTags.includes(tag)) { setTagInput(''); return; }
    setEditTags(prev => [...prev, tag]);
    setTagInput('');
  };

  const handleTagRemove = (tag: string) => setEditTags(prev => prev.filter(t => t !== tag));

  // ── Guards ────────────────────────────────────────────────────────────────
  if (projectLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!project) {
    return <div className="text-center py-16"><p className="text-muted-foreground">Project not found</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/projects">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Button>
      </Link>

      <PageHeader
        title={project.name}
        description={project.description || undefined}
        actions={
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <Link href={`/projects/${projectId}/analytics`}>
              <Button variant="outline" size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Analytics</Button>
            </Link>
            <Link href={`/projects/${projectId}/api-keys`}>
              <Button variant="outline" size="sm" className="gap-2"><Key className="h-4 w-4" />API Keys</Button>
            </Link>
            <Link href={`/projects/${projectId}/webhooks`}>
              <Button variant="outline" size="sm" className="gap-2"><Webhook className="h-4 w-4" />Webhooks</Button>
            </Link>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statsLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-lg border border-card-border bg-card animate-pulse" />)
        ) : (
          <>
            <StatCard label="Total Images" value={stats?.totalImages || 0} icon={ImageIcon} />
            <StatCard label="Storage Used" value={formatBytes(stats?.storageUsed || 0)} icon={HardDrive} />
            <StatCard label="Favorites" value={stats?.favoriteImages || 0} icon={Star} />
            <StatCard label="API Requests" value={stats?.apiRequests || 0} />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-card-border">
        {(['images', 'trash'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'trash' ? <Trash2 className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {tab === 'images' ? 'Images' : 'Recycle Bin'}
            {tab === 'trash' && trashImages.length > 0 && (
              <span className="ml-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                {trashImages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── IMAGES TAB ────────────────────────────────────────────────────────── */}
      {activeTab === 'images' && (
        <>
          {/* Search + action bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search images…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={bulkMode ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
              className="gap-2 shrink-0"
            >
              <Layers className="h-4 w-4" />
              {bulkMode ? 'Exit select' : 'Select'}
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2 shrink-0">
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={e => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />
          </div>

          {/* Album / filter pills */}
          {(albums.length > 0 || allImages.some(img => img.favorite)) && (
            <div className="flex items-center gap-2 flex-wrap">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {/* All */}
              <button
                onClick={() => setAlbumFilter(null)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  albumFilter === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-card-border text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                All
                <span className="opacity-60">{allImages.length}</span>
              </button>
              {/* Favorites */}
              {allImages.some(img => img.favorite) && (
                <button
                  onClick={() => setAlbumFilter(albumFilter === '__favs' ? null : '__favs')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    albumFilter === '__favs'
                      ? 'bg-yellow-400/20 text-yellow-700 border-yellow-400/40'
                      : 'bg-card border-card-border text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <Star className="h-3 w-3" />
                  Favorites
                  <span className="opacity-60">{allImages.filter(img => img.favorite).length}</span>
                </button>
              )}
              {/* Album pills */}
              {albums.map(album => (
                <button
                  key={album}
                  onClick={() => setAlbumFilter(albumFilter === album ? null : album)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    albumFilter === album
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-card-border text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {album}
                  <span className="opacity-60">{allImages.filter(img => img.album === album).length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Upload queue */}
          {uploadQueue.length > 0 && (
            <div className="rounded-lg border border-card-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Uploads
                  {pendingUploads > 0 && <span className="ml-2 text-muted-foreground font-normal normal-case">{pendingUploads} in progress…</span>}
                </p>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={dismissDoneItems}>Clear done</Button>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {uploadQueue.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="shrink-0 w-5">
                      {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {item.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                      {item.status === 'uploading' && <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-medium truncate text-foreground">{item.name}</p>
                      {item.status === 'uploading' && (
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                      {item.status === 'error' && <p className="text-[10px] text-destructive">{item.error}</p>}
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground w-12 text-right">
                      {item.status === 'uploading' && `${item.progress}%`}
                      {item.status === 'done' && <span className="text-green-600">Done</span>}
                      {item.status === 'error' && (
                        <button onClick={() => retryUpload(item)} className="flex items-center gap-0.5 text-primary hover:underline text-[11px]">
                          <RefreshCw className="h-3 w-3" />Retry
                        </button>
                      )}
                    </div>
                    {item.status !== 'uploading' && (
                      <button onClick={() => setUploadQueue(prev => prev.filter(i => i.id !== item.id))} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image grid */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative rounded-xl border-2 border-dashed transition-colors min-h-[120px]',
              isDragOver ? 'border-primary bg-primary/5' : 'border-transparent',
            )}
          >
            {isDragOver && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl pointer-events-none">
                <CloudUpload className="h-10 w-10 text-primary mb-2" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-primary">Drop images here</p>
              </div>
            )}

            {bulkMode && filteredImages.length > 0 && (
              <div className="flex items-center gap-3 mb-3 px-1">
                <button
                  onClick={selectedIds.size === filteredImages.length ? clearSelection : selectAll}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                    selectedIds.size === filteredImages.length ? 'bg-primary border-primary' : 'border-border',
                  )}>
                    {selectedIds.size === filteredImages.length && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  {selectedIds.size === filteredImages.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-primary font-medium">{selectedIds.size} selected</span>
                )}
              </div>
            )}

            {imagesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => <div key={i} className="aspect-square rounded-lg border border-card-border bg-card animate-pulse" />)}
              </div>
            ) : filteredImages.length > 0 ? (
              <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4', isDragOver && 'opacity-30')}>
                {filteredImages.map((image, index) => (
                  <button
                    key={image.id}
                    onClick={() => bulkMode ? toggleSelect(image.id) : setSelectedImage(image)}
                    className={cn(
                      'group relative aspect-square rounded-lg border bg-card overflow-hidden transition-all',
                      bulkMode && selectedIds.has(image.id)
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-card-border hover:border-border',
                    )}
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    <img
                      src={image.publicUrl || image.url}
                      alt={image.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-left opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs font-medium text-white truncate">{image.name}</p>
                      <p className="text-xs text-white/80">{formatBytes(image.size)}</p>
                      {image.album && <p className="text-[10px] text-white/60 truncate mt-0.5">{image.album}</p>}
                    </div>
                    {/* Checkbox overlay in bulk mode */}
                    {bulkMode && (
                      <div className="absolute top-2 left-2">
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shadow-sm',
                          selectedIds.has(image.id) ? 'bg-primary border-primary' : 'bg-white/90 border-white/90',
                        )}>
                          {selectedIds.has(image.id) && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>
                    )}
                    {/* Favorite star */}
                    {image.favorite && !bulkMode && (
                      <div className="absolute top-2 right-2">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 drop-shadow" />
                      </div>
                    )}
                    {/* Tags badge */}
                    {(image.tags ?? []).length > 0 && !bulkMode && (
                      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="flex items-center gap-0.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                          <Tag className="h-2.5 w-2.5" />
                          {(image.tags ?? []).length}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              !isDragOver && (
                albumFilter ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <div className="h-14 w-14 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
                      <FolderOpen className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No images in this filter</p>
                      <button className="text-xs text-primary underline underline-offset-2 mt-1" onClick={() => setAlbumFilter(null)}>
                        Show all images
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <div className="h-14 w-14 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
                      <CloudUpload className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Drop images here to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        or{' '}
                        <button className="text-primary underline underline-offset-2" onClick={() => fileInputRef.current?.click()}>
                          browse files
                        </button>
                        {' '}· Paste with Ctrl+V · PNG, JPEG, WebP, GIF, AVIF, SVG
                      </p>
                    </div>
                  </div>
                )
              )
            )}
          </div>

          {filteredImages.length > 0 && !isDragOver && !bulkMode && (
            <p className="text-xs text-muted-foreground text-center">
              Drag images anywhere on this page to upload · or paste with Ctrl+V
            </p>
          )}
        </>
      )}

      {/* ── TRASH TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === 'trash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {trashLoading ? 'Loading…' : trashImages.length === 0 ? 'Recycle Bin is empty' : `${trashImages.length} image${trashImages.length !== 1 ? 's' : ''} in trash`}
            </p>
            {trashImages.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleRestoreAll}>
                  <RotateCcw className="h-3.5 w-3.5" />Restore all
                </Button>
                <Button variant="destructive" size="sm" className="gap-2 text-xs" onClick={handleEmptyTrash}>
                  <Trash2 className="h-3.5 w-3.5" />Empty Bin
                </Button>
              </div>
            )}
          </div>
          {trashImages.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
              Images in the Recycle Bin are not counted in your storage. Permanently deleted images cannot be recovered.
            </div>
          )}
          {trashLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="aspect-square rounded-lg border border-card-border bg-card animate-pulse" />)}
            </div>
          ) : trashImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Recycle Bin is empty</p>
                <p className="text-xs text-muted-foreground mt-1">Deleted images will appear here</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {trashImages.map(image => (
                <div key={image.id} className="group relative rounded-lg border border-card-border bg-card overflow-hidden">
                  <div className="aspect-square relative">
                    <img src={image.publicUrl || image.url} alt={image.name} className="w-full h-full object-cover opacity-60 grayscale" />
                  </div>
                  <div className="p-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-foreground truncate">{image.name}</p>
                    {image.deletedAt && <p className="text-[10px] text-muted-foreground">Deleted {formatDate(image.deletedAt)}</p>}
                    <div className="flex gap-1.5 pt-0.5">
                      <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => handleRestore(image.id)}>
                        <RotateCcw className="h-3 w-3" />Restore
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handlePermanentDelete(image.id, image.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bulk action floating bar ──────────────────────────────────────────── */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 min-w-[320px]">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background shadow-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground">{selectedIds.size} selected</span>
              <div className="w-px h-4 bg-border" />
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setShowBulkAlbum(v => !v); setShowBulkTag(false); }} disabled={isBulkProcessing}>
                <FolderOpen className="h-3.5 w-3.5" />Album
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setShowBulkTag(v => !v); setShowBulkAlbum(false); }} disabled={isBulkProcessing}>
                <Tag className="h-3.5 w-3.5" />Tag
              </Button>
              <Button size="sm" variant="destructive" className="text-xs" onClick={handleBulkDelete} disabled={isBulkProcessing}>
                {isBulkProcessing ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
              <button onClick={clearSelection} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Album input */}
            {showBulkAlbum && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Input
                  value={bulkAlbumInput}
                  onChange={e => setBulkAlbumInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBulkAlbum()}
                  placeholder="Album name (leave blank to remove)"
                  className="h-8 text-xs flex-1"
                  autoFocus
                />
                <Button size="sm" className="h-8 text-xs px-3" onClick={handleBulkAlbum} disabled={isBulkProcessing}>
                  Move
                </Button>
              </div>
            )}
            {/* Tag input */}
            {showBulkTag && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Input
                  value={bulkTagInput}
                  onChange={e => setBulkTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBulkTag()}
                  placeholder="Tag to add to selected"
                  className="h-8 text-xs flex-1"
                  autoFocus
                />
                <Button size="sm" className="h-8 text-xs px-3" onClick={handleBulkTag} disabled={isBulkProcessing}>
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Image Detail Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-3xl max-h-[calc(100dvh-1rem)] overflow-x-hidden overflow-y-auto p-4 sm:max-h-[90vh] sm:p-6">
          {selectedImage && (
            <>
              <DialogHeader>
                <DialogTitle>Image details</DialogTitle>
              </DialogHeader>
              <div className="min-w-0 space-y-5">
                {/* Preview */}
                <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2 sm:p-3">
                  <img
                    src={selectedImage.publicUrl || selectedImage.url}
                    alt={selectedImage.name}
                    className="h-auto max-h-[38vh] w-auto max-w-full object-contain sm:max-h-72"
                  />
                </div>

                {/* Name (editable) */}
                <div className="min-w-0 space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Name</label>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Album (editable) */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Album</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <Input
                      value={editAlbum}
                      onChange={e => setEditAlbum(e.target.value)}
                      placeholder="Add to album…"
                      className="text-sm flex-1"
                      list="album-suggestions"
                    />
                    <datalist id="album-suggestions">
                      {albums.map(a => <option key={a} value={a} />)}
                    </datalist>
                  </div>
                </div>

                {/* Tags (editable) */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-medium">Tags</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {editTags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                        {tag}
                        <button onClick={() => handleTagRemove(tag)} className="text-muted-foreground hover:text-foreground ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <Input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTagAdd(); } }}
                      placeholder="Add tag…"
                      className="h-7 text-xs w-28 rounded-full"
                    />
                  </div>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-sm rounded-lg border border-card-border bg-muted/20 p-3">
                  <div><p className="text-muted-foreground text-xs">Format</p><p className="font-medium mt-0.5">{selectedImage.format.toUpperCase()}</p></div>
                  <div><p className="text-muted-foreground text-xs">Size</p><p className="font-medium mt-0.5">{formatBytes(selectedImage.size)}</p></div>
                  {selectedImage.width && selectedImage.height && (
                    <div><p className="text-muted-foreground text-xs">Dimensions</p><p className="font-medium mt-0.5">{selectedImage.width} × {selectedImage.height}px</p></div>
                  )}
                  <div><p className="text-muted-foreground text-xs">Uploaded</p><p className="font-medium mt-0.5">{formatDate(selectedImage.createdAt)}</p></div>
                </div>

                {/* URL */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Storage key</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate text-foreground">
                      {selectedImage.publicUrl || selectedImage.url}
                    </code>
                    <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => navigator.clipboard.writeText(selectedImage.publicUrl || selectedImage.url)}>
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <Button variant="outline" size="sm" onClick={() => handleToggleFavorite(selectedImage.id)} className="shrink-0 gap-2">
                    <Star className={cn('h-4 w-4', selectedImage.favorite && 'fill-yellow-400 text-yellow-400')} />
                    {selectedImage.favorite ? 'Unfavorite' : 'Favorite'}
                  </Button>
                  <Button variant="outline" size="sm" asChild className="shrink-0 gap-2">
                    <a href={(selectedImage as Image & { downloadUrl?: string }).downloadUrl || selectedImage.url} download>
                      <Download className="h-4 w-4" />Download
                    </a>
                  </Button>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                    <Button size="sm" onClick={handleSaveImageDetails} disabled={isSavingDetails} className="min-w-0 flex-1 gap-2 sm:flex-none">
                      {isSavingDetails ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                      Save changes
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleSoftDelete(selectedImage.id)} className="shrink-0 gap-2">
                      <Trash2 className="h-4 w-4" />Delete
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
