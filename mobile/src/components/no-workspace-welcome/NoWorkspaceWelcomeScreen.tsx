import { View, useWindowDimensions } from "react-native";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { WelcomeBrandBlock } from "./WelcomeBrandBlock";
import { WelcomeIllustration } from "./WelcomeIllustration";
import { WelcomeBottomSection } from "./WelcomeBottomActions";

type JoinRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

type Props = {
  compact?: boolean;
};

export function NoWorkspaceWelcomeScreen({ compact }: Props) {
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();
  const isShort = height < 760 || compact;

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<JoinRequest[]>("/api/join-requests/mine"),
    refetchInterval: 10000,
  });

  const pending = pendingRequests[0] ?? null;

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
    }, 5000);
    return () => clearInterval(interval);
  }, [pending, queryClient]);

  return (
    <View style={{ flex: 1, width: "100%" }} testID="no-workspace-welcome-screen">
      <View style={{ width: "100%", paddingTop: isShort ? 12 : 18, flexShrink: 0 }}>
        <WelcomeBrandBlock compact={isShort} pendingTeamName={pending?.team.name} />
      </View>

      <WelcomeIllustration compact={isShort} />

      <View style={{ height: isShort ? 14 : 18, flexShrink: 0 }} />

      <WelcomeBottomSection pendingRequest={pending} />
    </View>
  );
}
