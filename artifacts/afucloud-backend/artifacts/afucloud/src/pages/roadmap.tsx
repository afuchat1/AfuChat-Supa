import { Link } from 'wouter';
import { Cloud, CheckCircle2, Circle, Clock, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const phases = [
  {
    phase: 1,
    title: 'Images Platform',
    status: 'active' as const,
    quarter: 'Q3 2026',
    description: 'Professional image storage, management, and delivery via REST API. The foundation of AfuCloud.',
    features: [
      'Upload: drag & drop, paste, multi-file, chunked',
      'Formats: PNG, JPEG, WebP, GIF, AVIF, SVG, HEIC',
      'Management: tags, albums, favorites, trash, restore',
      'Delivery: public URLs, signed URLs, temporary links',
      'Processing: resize, crop, compress, format convert',
      'API keys per project (dev / prod / test environments)',
      'Personal access tokens with fine-grained scopes',
      'Webhooks with signature verification & retries',
      'Analytics: uploads, downloads, storage, bandwidth',
    ],
  },
  {
    phase: 2,
    title: 'Video Platform',
    status: 'planned' as const,
    quarter: 'Q1 2027',
    description: 'Professional video infrastructure with streaming, transcoding, and adaptive bitrate delivery.',
    features: [
      'Video uploads with chunked & resumable support',
      'Adaptive bitrate streaming (HLS / DASH)',
      'Automatic transcoding & compression',
      'Thumbnail & preview clip generation',
      'Multiple resolutions (360p → 4K)',
      'Private & public video sharing',
      'Signed video URLs',
      'Subtitle support',
      'Video analytics',
    ],
  },
  {
    phase: 3,
    title: 'Document Platform',
    status: 'planned' as const,
    quarter: 'Q2 2027',
    description: 'Secure document storage and management for PDFs, Office files, and more.',
    features: [
      'PDF, Word, Excel, PowerPoint, text, archives',
      'Version history & document previews',
      'OCR indexing & full-text search',
      'Metadata extraction',
      'Secure document sharing',
      'Signed document URLs',
    ],
  },
  {
    phase: 4,
    title: 'Audio Platform',
    status: 'planned' as const,
    quarter: 'Q3 2027',
    description: 'Audio asset management with streaming, waveform generation, and podcast hosting.',
    features: [
      'Audio uploads & streaming',
      'Audio previews & waveform generation',
      'Metadata management & playlist support',
      'Podcast hosting & download management',
      'Audio analytics',
    ],
  },
  {
    phase: 5,
    title: 'Email Storage Platform',
    status: 'planned' as const,
    quarter: 'Q4 2027',
    description: 'Storage infrastructure for email systems — attachments, inline images, and secure links.',
    features: [
      'Email attachment storage',
      'Inline image hosting',
      'Secure attachment links with expiration',
      'Attachment analytics',
      'Large attachment support',
    ],
  },
  {
    phase: 6,
    title: 'Developer Platform',
    status: 'planned' as const,
    quarter: 'Q1 2028',
    description: 'Official SDKs, CLI, API playground, and full OpenAPI tooling for developers.',
    features: [
      'Official SDKs (Node.js, Python, Go, Ruby)',
      'Command Line Interface (CLI)',
      'API Playground & Explorer',
      'OpenAPI specification',
      'GraphQL gateway (optional)',
      'SDK generators',
      'Example applications',
    ],
  },
  {
    phase: 7,
    title: 'Team Collaboration',
    status: 'planned' as const,
    quarter: 'Q2 2028',
    description: 'Organizations, teams, roles, and shared asset libraries for enterprise teams.',
    features: [
      'Teams & organizations',
      'Fine-grained roles & permissions',
      'Shared projects & asset libraries',
      'Activity logs & audit history',
      'Team invitations',
      'Enterprise administration',
    ],
  },
  {
    phase: 8,
    title: 'Custom Domains',
    status: 'planned' as const,
    quarter: 'Q3 2028',
    description: 'Bring your own domain for branded asset URLs and CDN configuration.',
    features: [
      'Domain verification & DNS validation',
      'SSL certificate automation',
      'Branded asset URLs (images.company.com)',
      'Custom CDN configuration',
      'Domain management dashboard',
    ],
  },
  {
    phase: 9,
    title: 'AI Services',
    status: 'planned' as const,
    quarter: 'Q4 2028',
    description: 'AI-powered media tools for tagging, search, enhancement, and organization.',
    features: [
      'Automatic image tagging & OCR',
      'Object detection & duplicate detection',
      'Smart search & AI-powered organization',
      'Background removal & image enhancement',
      'AI-generated metadata',
    ],
  },
  {
    phase: 10,
    title: 'Global CDN & Performance',
    status: 'planned' as const,
    quarter: 'Q1 2029',
    description: 'Intelligent global delivery with edge caching, processing, and traffic analytics.',
    features: [
      'Intelligent caching & smart cache invalidation',
      'Regional edge optimization',
      'Edge processing',
      'Automatic optimization',
      'Global bandwidth monitoring',
    ],
  },
  {
    phase: 11,
    title: 'Storage Expansion',
    status: 'planned' as const,
    quarter: 'Q2 2029',
    description: 'Extend to all asset types: backups, static sites, AI models, and application assets.',
    features: [
      'Images, Videos, Audio, Documents',
      'Archives, Backups, Application assets',
      'Static websites & configuration files',
      'AI model assets',
    ],
  },
  {
    phase: 12,
    title: 'Enterprise Features',
    status: 'planned' as const,
    quarter: 'Q3 2029',
    description: 'SSO, SCIM, compliance tools, and enterprise billing for large organizations.',
    features: [
      'Single Sign-On (SSO) & SCIM provisioning',
      'Compliance tools & audit exports',
      'Advanced security policies',
      'Storage quotas & data retention policies',
      'Organization billing & enterprise analytics',
    ],
  },
  {
    phase: 13,
    title: 'Marketplace',
    status: 'planned' as const,
    quarter: 'Q4 2029',
    description: 'A developer ecosystem with plugins, integrations, templates, and automation.',
    features: [
      'Community extensions & plugins',
      'Third-party integrations',
      'Templates & automation workflows',
    ],
  },
];

const statusConfig = {
  active: {
    label: 'In Progress',
    icon: Zap,
    badge: 'bg-primary/10 text-primary border-primary/20',
    icon_class: 'text-primary',
    ring: 'border-primary/30 bg-primary/5',
    number: 'bg-primary text-white',
  },
  planned: {
    label: 'Planned',
    icon: Clock,
    badge: 'bg-muted text-muted-foreground border-border',
    icon_class: 'text-muted-foreground',
    ring: 'border-border bg-card',
    number: 'bg-muted text-muted-foreground',
  },
  done: {
    label: 'Complete',
    icon: CheckCircle2,
    badge: 'bg-green-50 text-green-700 border-green-200',
    icon_class: 'text-green-500',
    ring: 'border-green-200 bg-green-50/50',
    number: 'bg-green-500 text-white',
  },
};

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-foreground">
      {/* Nav */}
      <header className="border-b border-border/50 bg-[#FAF8F5]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Cloud className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[15px] font-semibold tracking-tight">AfuCloud</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/roadmap" className="text-foreground font-medium">Roadmap</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Phase 1 actively in development
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Product Roadmap
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-8">
          AfuCloud is building the complete cloud platform for digital assets.
          Every feature is designed to integrate seamlessly with the same authentication,
          permission model, and API gateway.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {(['active', 'planned'] as const).map((s) => {
            const cfg = statusConfig[s];
            return (
              <div key={s} className="flex items-center gap-1.5 text-muted-foreground">
                <cfg.icon className={cn('h-3.5 w-3.5', cfg.icon_class)} strokeWidth={2} />
                {cfg.label}
              </div>
            );
          })}
        </div>
      </section>

      {/* Timeline */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border hidden sm:block" />

          <div className="space-y-5">
            {phases.map((phase) => {
              const cfg = statusConfig[phase.status];
              const StatusIcon = cfg.icon;

              return (
                <div key={phase.phase} className="relative flex gap-5 sm:gap-8">
                  {/* Phase number bubble */}
                  <div className="relative z-10 shrink-0 hidden sm:flex">
                    <div className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background',
                      cfg.number,
                    )}>
                      {phase.phase}
                    </div>
                  </div>

                  {/* Card */}
                  <div className={cn(
                    'flex-1 rounded-xl border p-5 transition-all',
                    cfg.ring,
                  )}>
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
                      {/* Mobile phase number */}
                      <div className={cn(
                        'sm:hidden h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                        cfg.number,
                      )}>
                        {phase.phase}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">
                            Phase {phase.phase} — {phase.title}
                          </h3>
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            cfg.badge,
                          )}>
                            <StatusIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">{phase.quarter}</p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {phase.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {phase.features.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-1 text-[11px] text-foreground/70"
                        >
                          {phase.status === 'active'
                            ? <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />
                            : <Circle className="h-2 w-2 text-muted-foreground/40 shrink-0" />
                          }
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="max-w-5xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
            Start with Phase 1 today
          </h2>
          <p className="text-white/70 mb-7 max-w-md mx-auto text-sm leading-relaxed">
            The Images Platform is live. Upload, manage, and deliver images through
            a production-grade API — free to start.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="gap-2 h-10 px-5 text-sm">
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="outline" className="gap-2 h-10 px-5 text-sm border-white/30 text-white hover:bg-white/10 hover:text-white">
                View docs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-[#FAF8F5]">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Cloud className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-medium text-foreground">AfuCloud</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link>
            <Link href="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
          <p>© 2026 AfuCloud. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
