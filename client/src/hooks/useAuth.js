import { trpc } from '../lib/trpc.js';

/**
 * Hook to access current authenticated user state.
 */
export function useAuth() {
  const { data: user, isLoading, error, refetch } = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  return {
    user,
    isLoading,
    error,
    refetch,
    isLoggedIn: !!user,
  };
}
