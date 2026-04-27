import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export const SESSION_QUERY_KEY = ["auth-session"] as const;
let forceSignedOutUntil = 0;

export function markSessionSignedOut(ms = 30_000) {
  forceSignedOutUntil = Date.now() + ms;
}

export function clearSignedOutMark() {
  forceSignedOutUntil = 0;
}

export const useSession = () => {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      if (Date.now() < forceSignedOutUntil) {
        return null;
      }
      try {
        // Avoid stale in-memory auth cache after sign-out/sign-in transitions.
        const result = await authClient.getSession({
          fetchOptions: {
            headers: { "X-Force-Fetch": "1" },
          },
        } as never);
        return result.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60, // re-check every minute
  });
};

export const useInvalidateSession = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
};
