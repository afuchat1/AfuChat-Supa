import { useState } from 'react';
import { useGetMe, useUpdateProfile } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User, Shield } from 'lucide-react';
import { API_BASE } from '@/lib/api-base';

async function changePassword(currentPassword: string, newPassword: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/auth/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to change password');
  }
  return res.json();
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: user, isLoading } = useGetMe();
  const updateMutation = useUpdateProfile();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Pre-fill when data loads
  if (user && name === '' && email === '') {
    setName(user.name || '');
    setEmail(user.email || '');
  }

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(
      { data: { name } },
      {
        onSuccess: () => toast({ title: 'Saved', description: 'Profile updated successfully' }),
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password too short', description: 'Must be at least 8 characters', variant: 'destructive' });
      return;
    }
    const token = localStorage.getItem('afucloud_token') || '';
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword, token);
      toast({ title: 'Password changed', description: 'Your password has been updated successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Profile */}
          <section className="rounded-lg border border-card-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <User className="h-4 w-4 text-primary" strokeWidth={2} />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Profile</h2>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} disabled type="email" className="opacity-60 cursor-not-allowed" />
                <p className="text-xs text-muted-foreground">Email cannot be changed at this time.</p>
              </div>
              <Button type="submit" disabled={updateMutation.isPending || isLoading}>
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </section>

          {/* Security */}
          <section className="rounded-lg border border-card-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Shield className="h-4 w-4 text-primary" strokeWidth={2} />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Your current password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
              <Button
                type="submit"
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              >
                {changingPassword ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </section>
        </div>

        {/* Account info */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-card-border bg-card p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{user?.name || '—'}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || '—'}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-card-border bg-card p-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Security Tips</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• Use a strong, unique password</li>
              <li>• Never share your API keys</li>
              <li>• Rotate keys regularly</li>
              <li>• Use scoped keys per service</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
