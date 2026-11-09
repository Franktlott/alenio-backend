import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Inbox as InboxIcon, Send } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { formatRelativeTime } from "@/components/activity/types";
import { connectionRequestErrorMessage } from "@/lib/connection-request-error";
import type { ConnectionEntry, ConnectionsResponse } from "@/lib/types";
import { colors, typography } from "@/theme";

type RequestTab = "received" | "sent";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Opens straight to Sent when the row was tapped with nothing incoming. */
  initialTab?: RequestTab;
};

export function ConnectionRequestsSheet({
  visible,
  onClose,
  initialTab = "received",
}: Props) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [tab, setTab] = useState<RequestTab>(initialTab);

  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [initialTab, visible]);

  const { data: connections, isLoading } = useQuery({
    queryKey: ["connections", currentUserId],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: visible && currentUserId.length > 0,
  });
  const incoming = useMemo(() => connections?.incoming ?? [], [connections]);
  const outgoing = useMemo(() => connections?.outgoing ?? [], [connections]);
  const requests = tab === "received" ? incoming : outgoing;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["connections"] });
    queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] });
    queryClient.invalidateQueries({ queryKey: ["person"] });
  };

  const respond = useMutation({
    mutationFn: ({
      request,
      action,
    }: {
      request: ConnectionEntry;
      action: "accept" | "decline";
    }) => api.post(`/api/connections/${action}`, { userId: request.person.id }),
    onSuccess: (_result, { request, action }) => {
      const name = request.person.name?.trim() || "Alenio member";
      toast({
        title: action === "accept" ? `Connected with ${name}` : `Declined ${name}`,
        preset: "done",
      });
      invalidate();
    },
    onError: (error: unknown) => {
      toast({ title: connectionRequestErrorMessage(error), preset: "error" });
    },
  });

  const cancel = useMutation({
    mutationFn: (request: ConnectionEntry) =>
      api.delete("/api/connections", { userId: request.person.id }),
    onSuccess: (_result, request) => {
      const name = request.person.name?.trim() || "Alenio member";
      toast({ title: `Request to ${name} cancelled`, preset: "done" });
      invalidate();
    },
    onError: (error: unknown) => {
      toast({ title: connectionRequestErrorMessage(error), preset: "error" });
    },
  });

  return (
    <AlenioBottomSheet
      visible={visible}
      onClose={onClose}
      title="Connection requests"
      subtitle={
        tab === "received"
          ? incoming.length === 0
            ? "Nothing waiting on you"
            : `${incoming.length} ${incoming.length === 1 ? "person wants" : "people want"} to connect`
          : outgoing.length === 0
            ? "No open requests"
            : `${outgoing.length} awaiting a reply`
      }
      compact
      bodyHeightRatio={0.46}
      showScrollIndicator={requests.length > 4}
      testID="connection-requests-sheet"
    >
      <View style={styles.toggle}>
        {(["received", "sent"] as const).map((option) => {
          const selected = tab === option;
          const count = option === "received" ? incoming.length : outgoing.length;
          const label = option === "received" ? "Received" : "Sent";
          return (
            <Pressable
              key={option}
              onPress={() => setTab(option)}
              style={selected ? styles.segmentSelected : styles.segment}
              hitSlop={4}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label} requests, ${count}`}
              testID={`connection-requests-sheet-tab-${option}`}
            >
              <Text style={selected ? styles.segmentLabelSelected : styles.segmentLabel}>
                {count > 0 ? `${label} · ${count}` : label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading && requests.length === 0 ? (
        <View style={styles.state}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.empty} testID={`connection-requests-sheet-empty-${tab}`}>
          <LinearGradient
            colors={["#EEF2FF", "#F6F3FF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyIcon}
          >
            {tab === "received" ? (
              <InboxIcon size={22} color={colors.brand} strokeWidth={2} />
            ) : (
              <Send size={20} color={colors.brand} strokeWidth={2} />
            )}
          </LinearGradient>
          <Text style={styles.emptyTitle}>
            {tab === "received" ? "You're all caught up" : "No requests pending"}
          </Text>
          <Text style={styles.emptyText}>
            {tab === "received"
              ? "When someone asks to connect, they'll land here for you to accept."
              : "People you invite stay here until they reply, and you can cancel any time."}
          </Text>
          {tab === "received" && outgoing.length > 0 ? (
            <Pressable
              onPress={() => setTab("sent")}
              style={styles.emptyLink}
              accessibilityRole="button"
              accessibilityLabel="View sent requests"
            >
              <Text style={styles.emptyLinkLabel}>
                View {outgoing.length} sent request{outgoing.length === 1 ? "" : "s"}
              </Text>
              <ChevronRight size={14} color={colors.brand} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View>
          {requests.map((request, index) => {
            const name = request.person.name?.trim() || "Alenio member";
            const detail =
              request.person.profileTitle?.trim() ||
              (request.person.username ? `@${request.person.username}` : null);
            const busy =
              (respond.isPending && respond.variables?.request.id === request.id) ||
              (cancel.isPending && cancel.variables?.id === request.id);
            return (
              <View
                key={request.id}
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
                testID={`connection-requests-sheet-row-${request.person.id}`}
              >
                <UserAvatar
                  user={request.person}
                  size={42}
                  radius={21}
                  backgroundColor="#EEF2FF"
                  textColor={colors.brand}
                  fontSize={15}
                />
                <View style={styles.copy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  {detail ? (
                    <Text style={styles.detail} numberOfLines={1}>
                      {detail}
                    </Text>
                  ) : null}
                  <Text style={styles.meta} numberOfLines={1}>
                    {tab === "received" ? "Requested" : "Sent"}{" "}
                    {formatRelativeTime(request.createdAt)}
                  </Text>
                </View>
                {tab === "sent" ? (
                  <Pressable
                    onPress={() => cancel.mutate(request)}
                    disabled={busy}
                    style={styles.ignore}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel request to ${name}`}
                    testID={`connection-requests-sheet-cancel-${request.person.id}`}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#64748B" />
                    ) : (
                      <Text style={styles.ignoreLabel}>Cancel</Text>
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => respond.mutate({ request, action: "decline" })}
                      disabled={busy}
                      style={styles.ignore}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Ignore ${name}`}
                      testID={`connection-requests-sheet-decline-${request.person.id}`}
                    >
                      <Text style={styles.ignoreLabel}>Ignore</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => respond.mutate({ request, action: "accept" })}
                      disabled={busy}
                      style={[styles.accept, busy ? styles.acceptBusy : null]}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Accept ${name}`}
                      testID={`connection-requests-sheet-accept-${request.person.id}`}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.acceptLabel}>Accept</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignSelf: "flex-end",
    gap: 4,
    padding: 2,
    borderRadius: 9,
    backgroundColor: colors.surfaceSecondary,
  },
  segment: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentSelected: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  segmentLabel: {
    ...typography.metaTiny,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: "#7C8798",
  },
  segmentLabelSelected: {
    ...typography.metaTiny,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: colors.brand,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    ...typography.sectionSubtitle,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#101828",
  },
  detail: {
    ...typography.metaTiny,
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    color: "#5B6879",
  },
  meta: {
    ...typography.metaTiny,
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: "#94A3B8",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  ignore: {
    height: 30,
    minWidth: 62,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  ignoreLabel: {
    ...typography.sectionSubtitle,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#475569",
  },
  accept: {
    height: 30,
    minWidth: 62,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  acceptBusy: { opacity: 0.6 },
  acceptLabel: {
    ...typography.sectionSubtitle,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  state: { paddingVertical: 20, alignItems: "center" },
  empty: {
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 22,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E8FB",
    marginBottom: 10,
  },
  emptyTitle: {
    ...typography.sectionSubtitle,
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "700",
    color: "#101828",
  },
  emptyText: {
    ...typography.metaTiny,
    marginTop: 4,
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 16,
    color: "#7C8798",
  },
  emptyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 10,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  emptyLinkLabel: {
    ...typography.sectionSubtitle,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: colors.brand,
  },
});
