import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const token = localStorage.getItem('afucloud_token');
  
  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: ['/api/v1/auth/me'],
      enabled: !!token,
      retry: false,
    },
  });

  useEffect(() => {
    if (!token) {
      setLocation('/login');
      setIsChecking(false);
      return;
    }

    if (!isLoading) {
      if (error || !user) {
        localStorage.removeItem('afucloud_token');
        localStorage.removeItem('afucloud_refresh_token');
        setLocation('/login');
      }
      setIsChecking(false);
    }
  }, [token, isLoading, error, user, setLocation]);

  if (isChecking || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
