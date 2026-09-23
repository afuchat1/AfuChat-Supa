import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { BookOpen, Code, Zap, Lock, Upload, Image, Webhook, Key, ArrowRight, Copy, Check, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PublicHeader } from '@/components/public-header';

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative min-w-0 max-w-full overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 bg-[#1C1C1C] px-3 py-2 sm:px-4 border-b border-white/10">
        <span className="text-[11px] font-mono text-white/40">{language}</span>
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto bg-[#1C1C1C] px-3 py-3 text-[11px] leading-relaxed font-mono text-green-300/90 whitespace-pre sm:px-4 sm:text-[12px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const sections = [
  { id: 'quickstart', icon: Zap, title: 'Quick Start', badge: 'Start here' },
  { id: 'auth', icon: Lock, title: 'Authentication' },
  { id: 'upload', icon: Upload, title: 'Uploading Images' },
  { id: 'images', icon: Image, title: 'Managing Images' },
  { id: 'apikeys', icon: Key, title: 'API Keys' },
  { id: 'webhooks', icon: Webhook, title: 'Webhooks' },
  { id: 'reference', icon: Code, title: 'API Reference' },
];

const BASE = 'https://api.afuchat.com';

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('quickstart');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleSectionSelect = (sectionId: string) => {
    setActiveSection(sectionId);
    setMobileNavOpen(false);

    if (window.innerWidth < 1024) {
      document.getElementById(`docs-${sectionId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 lg:py-8">
        <PageHeader
          title="Developer Documentation"
          description="Everything you need to integrate AfuCloud into your applications"
          className="[&_h1]:text-xl sm:[&_h1]:text-2xl [&_p]:max-w-xl"
        />

        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:gap-6">
        {/* Documentation sidebar */}
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-48 lg:self-start">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-controls="docs-sections"
            className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground lg:hidden"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Documentation sections
            </span>
            {mobileNavOpen ? <X className="h-4 w-4 text-muted-foreground" /> : <Menu className="h-4 w-4 text-muted-foreground" />}
          </button>

          <nav
            id="docs-sections"
            aria-label="Documentation sections"
            className={cn(
              'mt-2 space-y-1 rounded-md border border-border bg-card p-2 lg:mt-0 lg:block lg:space-y-1 lg:border-0 lg:bg-transparent lg:p-0',
              mobileNavOpen ? 'block' : 'hidden lg:block'
            )}
          >
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSectionSelect(s.id)}
                className={cn(
                  'flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                  activeSection === s.id
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <s.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {s.title}
                {s.badge && (
                  <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                    {s.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-6 sm:space-y-8">

          {/* Quick Start */}
          <article
            id="docs-quickstart"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'quickstart' ? 'block' : 'block lg:hidden')}
          >
              <div className="space-y-4 rounded-lg border border-card-border bg-card p-4 sm:p-6">
                <h2 className="text-base font-semibold">Quick Start</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Get your first image uploaded to AfuCloud in under 5 minutes.
                </p>
                <ol className="space-y-4 text-sm text-muted-foreground">
                  <li className="flex gap-3"><span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">1</span><span>Register for an account and create your first project from the dashboard.</span></li>
                  <li className="flex gap-3"><span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">2</span><span>Create an API key for your project under <strong>Project → API Keys</strong>.</span></li>
                  <li className="flex gap-3"><span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">3</span><span>Request a pre-signed upload URL and upload your first image.</span></li>
                </ol>
              </div>
              <CodeBlock language="bash" code={`# 1. Register
curl -X POST ${BASE}/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"secret","name":"Your Name"}'

# 2. Login and get access token
curl -X POST ${BASE}/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"secret"}'

# 3. Create a project
curl -X POST ${BASE}/v1/projects \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"My App","slug":"my-app"}'`} />
          </article>

          {/* Auth */}
          <article
            id="docs-auth"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'auth' ? 'block' : 'block lg:hidden')}
          >
              <div className="space-y-3 rounded-lg border border-card-border bg-card p-4 sm:p-6">
                <h2 className="text-base font-semibold">Authentication</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AfuCloud uses JWT access tokens. Tokens expire after 15 minutes; use the refresh token to renew them.
                  Include the token in every protected request via the <code className="rounded bg-muted px-1.5 font-mono text-xs">Authorization</code> header.
                </p>
              </div>
              <CodeBlock language="bash" code={`# Register
POST ${BASE}/v1/auth/register
{ "email": "you@example.com", "password": "secret", "name": "Your Name" }

# Login
POST ${BASE}/v1/auth/login
{ "email": "you@example.com", "password": "secret" }

# Response
{
  "accessToken": "eyJ...",
  "refreshToken": "rt_...",
  "user": { "id": "...", "email": "...", "name": "..." }
}

# Refresh
POST ${BASE}/v1/auth/refresh
{ "refreshToken": "rt_..." }

# Protected request
GET ${BASE}/v1/auth/me
Authorization: Bearer <accessToken>`} />
              <CodeBlock language="bash" code={`# Change password
PATCH ${BASE}/v1/auth/me/password
Authorization: Bearer <token>
{ "currentPassword": "old", "newPassword": "new" }`} />
          </article>

          {/* Upload */}
          <article
            id="docs-upload"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'upload' ? 'block' : 'block lg:hidden')}
          >
              <div className="space-y-3 rounded-lg border border-card-border bg-card p-4 sm:p-6">
                <h2 className="text-base font-semibold">Uploading Images</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Uploads use a 2-step pre-signed URL flow: request an upload URL, PUT the file directly to storage,
                  then confirm the upload to register the image in your project.
                </p>
                <p className="text-sm text-muted-foreground">Supported formats: PNG · JPEG · WebP · GIF · AVIF · SVG · HEIC</p>
              </div>
              <CodeBlock language="typescript" code={`// Step 1: Get pre-signed upload URL
const { uploadUrl, imageId, key } = await fetch(
  '${BASE}/v1/projects/{projectId}/images/upload-url',
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer {token}',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      name: 'My Photo',
    }),
  }
).then(r => r.json());

// Step 2: PUT the file directly to the pre-signed URL
await fetch(uploadUrl, {
  method: 'PUT',
  body: fileBlob,
  headers: { 'Content-Type': 'image/jpeg' },
});

// Step 3: Confirm the upload
const image = await fetch(
  '${BASE}/v1/projects/{projectId}/images/confirm-upload',
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer {token}',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageId, key, size: fileBlob.size }),
  }
).then(r => r.json());

console.log(image.url); // https://img.afuchat.com/...`} />
          </article>

          {/* Images */}
          <article
            id="docs-images"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'images' ? 'block' : 'block lg:hidden')}
          >
              <div className="space-y-3 rounded-lg border border-card-border bg-card p-4 sm:p-6">
                <h2 className="text-base font-semibold">Managing Images</h2>
                <p className="text-sm text-muted-foreground">List, update, delete, restore, favorite, search, and filter images within a project.</p>
              </div>
              <div className="max-w-full overflow-x-auto rounded-lg border border-card-border bg-card">
                <table className="w-full min-w-[600px] text-xs">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Method</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Endpoint</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {[
                      ['GET', '/v1/projects/{id}/images', 'List images (search, tag, album, format, favorite filters)'],
                      ['GET', '/v1/projects/{id}/images/{imageId}', 'Get a single image'],
                      ['PATCH', '/v1/projects/{id}/images/{imageId}', 'Update name, tags, or album'],
                      ['DELETE', '/v1/projects/{id}/images/{imageId}', 'Soft delete (moves to trash)'],
                      ['PATCH', '/v1/projects/{id}/images/{imageId}/favorite', 'Toggle favorite'],
                      ['POST', '/v1/projects/{id}/images/{imageId}/restore', 'Restore from trash'],
                    ].map(([method, path, desc]) => (
                      <tr key={method + path} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            'rounded px-1.5 py-0.5 font-mono font-semibold',
                            method === 'GET' ? 'bg-blue-100 text-blue-700' :
                            method === 'POST' ? 'bg-green-100 text-green-700' :
                            method === 'PATCH' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          )}>{method}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{path}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CodeBlock language="bash" code={`# List images with search
GET ${BASE}/v1/projects/{projectId}/images?search=logo&format=png&page=1&limit=50

# Update image
PATCH ${BASE}/v1/projects/{projectId}/images/{imageId}
{ "name": "New name", "tags": ["logo", "brand"], "album": "brand-assets" }

# Favorite
PATCH ${BASE}/v1/projects/{projectId}/images/{imageId}/favorite`} />
          </article>

          {/* API Keys */}
          <article
            id="docs-apikeys"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'apikeys' ? 'block' : 'block lg:hidden')}
          >
              <div className="space-y-3 rounded-lg border border-card-border bg-card p-4 sm:p-6">
                <h2 className="text-base font-semibold">API Keys</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create per-project API keys for development, production, and testing environments.
                  Each key supports fine-grained permission scopes. The raw key is shown only once at creation.
                </p>
              </div>
              <CodeBlock language="bash" code={`# Create an API key
POST ${BASE}/v1/projects/{projectId}/api-keys
Authorization: Bearer <token>
{
  "name": "Production server",
  "environment": "production",
  "scopes": ["images:read", "images:write"]
}

# Response (secret shown once)
{
  "id": "...",
  "name": "Production server",
  "environment": "production",
  "prefix": "afu_prod_abc",
  "scopes": ["images:read", "images:write"],
  "secret": "afu_prod_abc123...FULL_KEY_SHOWN_ONCE",
  "createdAt": "2026-07-30T..."
}

# List API keys
GET ${BASE}/v1/projects/{projectId}/api-keys

# Revoke
DELETE ${BASE}/v1/projects/{projectId}/api-keys/{keyId}

# Using an API key (instead of JWT)
Authorization: Bearer afu_prod_abc123...`} />
          </article>

          {/* Webhooks */}
          <article
            id="docs-webhooks"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'webhooks' ? 'block' : 'block lg:hidden')}
          >
              <div className="rounded-lg border border-card-border bg-card p-6 space-y-3">
                <h2 className="text-base font-semibold">Webhooks</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Subscribe to project events and receive signed POST requests to your endpoint.
                  Deliveries are retried up to 3 times with exponential backoff on failure.
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-card-border bg-card p-4 sm:p-5">
                <p className="text-xs font-semibold text-foreground">Available Events</p>
                <div className="flex flex-wrap gap-1.5">
                  {['image.uploaded','image.updated','image.deleted','project.created','token.created','token.revoked'].map(e => (
                    <code key={e} className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono">{e}</code>
                  ))}
                </div>
              </div>
              <CodeBlock language="bash" code={`# Create a webhook
POST ${BASE}/v1/projects/{projectId}/webhooks
{
  "url": "https://your-server.com/webhooks",
  "events": ["image.uploaded", "image.deleted"],
  "secret": "your-signing-secret"
}

# Webhook payload
{
  "event": "image.uploaded",
  "projectId": "...",
  "data": { /* image object */ },
  "timestamp": "2026-07-30T..."
}

# Verify signature (Node.js)
const signature = req.headers['x-afucloud-signature'];
const expected = crypto.createHmac('sha256', secret)
  .update(JSON.stringify(req.body)).digest('hex');
const isValid = crypto.timingSafeEqual(
  Buffer.from(signature), Buffer.from('sha256=' + expected)
);`} />
          </article>

          {/* API Reference */}
          <article
            id="docs-reference"
            className={cn('scroll-mt-4 space-y-6', activeSection === 'reference' ? 'block' : 'block lg:hidden')}
          >
              <div className="space-y-3 rounded-lg border border-card-border bg-card p-4 sm:p-6">
                <h2 className="text-base font-semibold">API Reference</h2>
                <p className="text-sm text-muted-foreground">
                  All endpoints are versioned under <code className="rounded bg-muted px-1.5 font-mono text-xs">/v1/</code>.
                  Every response includes standard fields.
                </p>
              </div>
              <div className="max-w-full overflow-x-auto rounded-lg border border-card-border bg-card">
                <div className="px-5 py-3 border-b border-card-border bg-muted/20">
                  <p className="text-xs font-semibold">All Endpoints</p>
                </div>
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-muted/10">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Method</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Path</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Auth</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {[
                      ['GET', '/healthz', '—', 'Health check'],
                      ['POST', '/v1/auth/register', '—', 'Register new user'],
                      ['POST', '/v1/auth/login', '—', 'Login, get tokens'],
                      ['POST', '/v1/auth/refresh', '—', 'Refresh access token'],
                      ['POST', '/v1/auth/logout', '✓', 'Logout (revoke refresh token)'],
                      ['GET', '/v1/auth/me', '✓', 'Get current user'],
                      ['PATCH', '/v1/auth/me/update', '✓', 'Update profile'],
                      ['PATCH', '/v1/auth/me/password', '✓', 'Change password'],
                      ['GET', '/v1/projects', '✓', 'List projects'],
                      ['POST', '/v1/projects', '✓', 'Create project'],
                      ['GET', '/v1/projects/:id', '✓', 'Get project'],
                      ['PATCH', '/v1/projects/:id', '✓', 'Update project'],
                      ['DELETE', '/v1/projects/:id', '✓', 'Delete project'],
                      ['GET', '/v1/projects/:id/stats', '✓', 'Project storage stats'],
                      ['GET', '/v1/projects/:id/images', '✓', 'List images'],
                      ['POST', '/v1/projects/:id/images/upload-url', '✓', 'Get pre-signed upload URL'],
                      ['POST', '/v1/projects/:id/images/confirm-upload', '✓', 'Confirm upload'],
                      ['GET', '/v1/projects/:id/images/:imgId', '✓', 'Get image'],
                      ['PATCH', '/v1/projects/:id/images/:imgId', '✓', 'Update image'],
                      ['DELETE', '/v1/projects/:id/images/:imgId', '✓', 'Soft delete image'],
                      ['PATCH', '/v1/projects/:id/images/:imgId/favorite', '✓', 'Toggle favorite'],
                      ['POST', '/v1/projects/:id/images/:imgId/restore', '✓', 'Restore from trash'],
                      ['GET', '/v1/projects/:id/api-keys', '✓', 'List API keys'],
                      ['POST', '/v1/projects/:id/api-keys', '✓', 'Create API key'],
                      ['DELETE', '/v1/projects/:id/api-keys/:keyId', '✓', 'Revoke API key'],
                      ['GET', '/v1/projects/:id/webhooks', '✓', 'List webhooks'],
                      ['POST', '/v1/projects/:id/webhooks', '✓', 'Create webhook'],
                      ['PATCH', '/v1/projects/:id/webhooks/:whId', '✓', 'Update webhook'],
                      ['DELETE', '/v1/projects/:id/webhooks/:whId', '✓', 'Delete webhook'],
                      ['GET', '/v1/analytics/overview', '✓', 'Platform analytics overview'],
                      ['GET', '/v1/projects/:id/analytics', '✓', 'Per-project analytics'],
                      ['GET', '/v1/tokens', '✓', 'List personal tokens'],
                      ['POST', '/v1/tokens', '✓', 'Create personal token'],
                      ['DELETE', '/v1/tokens/:id', '✓', 'Revoke personal token'],
                      ['GET', '/v1/activity', '✓', 'Activity log'],
                    ].map(([method, path, auth, desc]) => (
                      <tr key={path + method} className="hover:bg-muted/20">
                        <td className="px-4 py-2">
                          <span className={cn(
                            'rounded px-1.5 py-0.5 font-mono font-semibold text-[10px]',
                            method === 'GET' ? 'bg-blue-100 text-blue-700' :
                            method === 'POST' ? 'bg-green-100 text-green-700' :
                            method === 'PATCH' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          )}>{method}</span>
                        </td>
                        <td className="px-4 py-2 font-mono text-foreground text-[11px]">{path}</td>
                        <td className="px-4 py-2 text-center text-muted-foreground">{auth}</td>
                        <td className="px-4 py-2 text-muted-foreground">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </article>
        </div>
        </div>
      </main>
    </div>
  );
}
