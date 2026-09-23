import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useRegister } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Database, AlertCircle } from 'lucide-react';
import { AuthHeader } from '@/components/auth-header';

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const registerMutation = useRegister();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      toast({
        title: 'Invalid password',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }
    
    registerMutation.mutate(
      { data: { name, email, password } },
      {
        onSuccess: (data) => {
          localStorage.setItem('afucloud_token', data.accessToken);
          localStorage.setItem('afucloud_refresh_token', data.refreshToken);
          toast({
            title: 'Account created',
            description: 'Welcome to AfuCloud',
          });
          setLocation('/dashboard');
        },
        onError: (error) => {
          toast({
            title: 'Registration failed',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-foreground/10">
            <Database className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold text-primary-foreground">AfuCloud</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h2 className="text-3xl font-semibold text-primary-foreground">
            Start building in minutes
          </h2>
          <p className="text-base text-primary-foreground/80">
            Join teams using AfuCloud to deliver high-performance digital experiences.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <AuthHeader />
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground">
              Get started with AfuCloud today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Alex Chen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={registerMutation.isPending}
                data-testid="input-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={registerMutation.isPending}
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={registerMutation.isPending}
                data-testid="input-password"
              />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>

            {registerMutation.isError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>Registration failed. Please try again.</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending}
              data-testid="button-submit"
            >
              {registerMutation.isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="font-medium text-primary hover:underline" data-testid="link-login">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
