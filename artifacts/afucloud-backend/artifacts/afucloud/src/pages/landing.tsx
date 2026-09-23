import { Link } from 'wouter';
import { Cloud, Upload, Key, Zap, Shield, Code2, ArrowRight, Check, Github, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Upload,
    title: 'Image Management',
    description: 'Upload, organize, tag, and deliver images at scale. PNG, JPEG, WebP, AVIF, GIF, SVG — every format supported.',
  },
  {
    icon: Zap,
    title: 'Instant CDN Delivery',
    description: 'Every asset served through a global CDN. Permanent URLs, signed URLs, and temporary links out of the box.',
  },
  {
    icon: Key,
    title: 'Developer-First API',
    description: 'Clean REST API with OpenAPI spec, pre-signed upload URLs, and per-project API keys with fine-grained scopes.',
  },
  {
    icon: Shield,
    title: 'Secure by Default',
    description: 'JWT authentication, permission-based authorization, MIME validation, and signed URLs for private assets.',
  },
  {
    icon: Code2,
    title: 'OpenAPI Spec',
    description: 'Every endpoint documented. Generate SDKs, test in the playground, and integrate in minutes.',
  },
  {
    icon: Globe,
    title: 'Multi-Project',
    description: 'Separate projects for each application. Independent API keys, storage buckets, analytics, and webhooks.',
  },
];

const uploadExample = `// Upload an image via pre-signed URL
const { uploadUrl, imageId, key } = await fetch(
  'https://api.afuchat.com/v1/projects/{projectId}/images/upload-url',
  {
    method: 'POST',
    headers: { Authorization: 'Bearer {token}', 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', name: 'My Photo' }),
  }
).then(r => r.json());

// PUT directly to storage
await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

// Confirm the upload
await fetch(
  'https://api.afuchat.com/v1/projects/{projectId}/images/confirm-upload',
  {
    method: 'POST',
    headers: { Authorization: 'Bearer {token}', 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, key, size: file.size }),
  }
);`;

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For personal projects',
    storage: '5 GB',
    images: '10,000',
    api: 'Dashboard only',
    cta: 'Get started',
  },
  {
    name: 'Developer',
    price: '$1',
    period: '/month',
    description: 'For devs building on AfuCloud',
    storage: '10 GB',
    images: 'Unlimited',
    api: '500K API req/mo',
    cta: 'Start building',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For production applications',
    storage: '100 GB',
    images: 'Unlimited',
    api: '5M API req/mo',
    cta: 'Start free trial',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-foreground font-sans">
      {/* Nav */}
      <header className="border-b border-border/50 bg-[#FAF8F5]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Cloud className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">AfuCloud</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#api" className="hover:text-foreground transition-colors">API</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>
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
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Phase 1 — Images Platform
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6 leading-[1.1]">
          Developer-first<br />
          <span className="text-primary">cloud storage</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Store, process, manage, and deliver digital assets through a professional REST API.
          Built for teams who ship fast and demand reliability.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="gap-2 h-11 px-6">
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/docs">
            <Button variant="outline" size="lg" className="gap-2 h-11 px-6">
              <Code2 className="h-4 w-4" />
              View docs
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">No credit card required · 5 GB free forever</p>
      </section>

      {/* Feature grid */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need to ship</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            A complete asset management platform designed for developers who care about quality.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-white p-6 space-y-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <f.icon className="h-4.5 w-4.5 text-primary" strokeWidth={2} />
              </div>
              <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* API code example */}
      <section id="api" className="bg-white border-y border-border py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">API-First</p>
              <h2 className="text-3xl font-bold tracking-tight mb-4">Upload in 3 steps</h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Request a pre-signed URL, upload directly from the browser or server, then confirm. 
                No proxying through our servers — maximum speed, minimum latency.
              </p>
              <ul className="space-y-3">
                {['Request a pre-signed upload URL', 'PUT the file directly to storage', 'Confirm the upload to register it'].map((step, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3 text-primary" strokeWidth={2.5} />
                    </div>
                    {step}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link href="/register">
                  <Button className="gap-2">
                    Try the API
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[#1C1C1C] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                <span className="ml-2 text-[11px] text-white/40 font-mono">upload.ts</span>
              </div>
              <pre className="p-4 text-[11px] leading-relaxed font-mono text-green-300/90 overflow-x-auto">
                <code>{uploadExample}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Simple, transparent pricing</h2>
          <p className="text-muted-foreground">Start free. Scale as you grow. No surprise bills.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 space-y-5 ${
                plan.highlight
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-white'
              }`}
            >
              {plan.highlight && (
                <div className="inline-flex rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wide">
                  Most popular
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">{plan.name}</p>
                <p className="text-3xl font-bold tracking-tight mt-1">{plan.price}</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" />{plan.storage} storage</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" />{plan.images} images</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" />{plan.api} API requests</li>
              </ul>
              <Link href="/register">
                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                  size="sm"
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">Ready to start building?</h2>
          <p className="text-white/70 mb-8 max-w-md mx-auto">
            Join developers who trust AfuCloud for storing and delivering their digital assets.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="gap-2 h-11 px-6">
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="outline" className="gap-2 h-11 px-6 border-white/30 text-white hover:bg-white/10 hover:text-white">
                Read the docs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-[#FAF8F5]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Cloud className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-medium text-foreground">AfuCloud</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
          <p>© 2026 AfuCloud. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
