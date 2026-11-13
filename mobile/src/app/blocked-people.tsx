import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldCheck } from "lucide-react-native";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { colors } from "@/theme";

const BRAND = colors.brand;

type BlockedPerson = {
  id: string;
  person: {
    id: string;
    name: string | null;
    username: string | null;
    image: string | null;
  };
  createdAt: string;
};

export default function BlockedPeopleScreen() {
  const { data: session } = useSession();
  const user = session?.user;
  const queryClient = useQueryClient();
  const [unblockTarget, setUnblockTarget] = useState<BlockedPerson["person"] | null>(
    null,
  );

  const { data: blockedPeople = [], isLoading } = useQuery({
    queryKey: ["blocked-people"],
    queryFn: () => api.get<BlockedPerson[]>("/api/connections/blocked"),
    enabled: !!user,
  });

  const unblockMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete("/api/connections/block", { userId }),
    onSuccess: (_data, userId) => {
      setUnblockTarget(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["blocked-people"] }),
        queryClient.invalidateQueries({ queryKey: ["connections"] }),
        queryClient.invalidateQueries({ queryKey: ["dms"] }),
        queryClient.invalidateQueries({ queryKey: ["person", userId] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["user-search"] }),
      ]);
      toast({ title: "Person unblocked", preset: "done" });
    },
    onError: () => toast({ title: "Could not unblock", preset: "error" }),
  });

  const handleClose = () => router.back();

  const confirmOverlay =
    unblockTarget !== null ? (
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!unblockMutation.isPending) setUnblockTarget(null);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.confirmCard}
          >
            <View style={styles.confirmAvatarWrap}>
              <UserAvatar
                user={{
                  name: unblockTarget.name ?? "Alenio member",
                  image: unblockTarget.image ?? null,
                }}
                size={64}
                radius={32}
              />
              <View style={styles.confirmBadge}>
                <ShieldCheck size={13} color="#278668" strokeWidth={2.2} />
              </View>
            </View>
            <Text style={styles.confirmTitle}>
              Unblock {unblockTarget.name ?? "this person"}?
            </Text>
            <Text style={styles.confirmBody}>
              They can find your profile again, but messaging, reactions, and
              video remain unavailable until a new connection is accepted.
            </Text>
            <TouchableOpacity
              onPress={() => unblockMutation.mutate(unblockTarget.id)}
              disabled={unblockMutation.isPending}
              activeOpacity={0.82}
              style={[
                alenioSheetStyles.primaryButton,
                { backgroundColor: BRAND, marginTop: 18 },
                unblockMutation.isPending
                  ? alenioSheetStyles.primaryButtonDisabled
                  : null,
              ]}
              testID="confirm-unblock-person"
            >
              {unblockMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Unblock person
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setUnblockTarget(null)}
              disabled={unblockMutation.isPending}
              style={alenioSheetStyles.cancelButton}
              testID="cancel-unblock-person"
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Keep blocked</Text>
            </TouchableOpacity>
          </Pressable>
        </View>
      </Pressable>
    ) : null;

  return (
    <AlenioBottomSheet
      asScreen
      title="Blocked people"
      subtitle="Blocking never changes a workspace you share"
      onClose={handleClose}
      showCloseButton
      showScrollIndicator={blockedPeople.length > 4}
      bodyHeightRatio={0.58}
      testID="blocked-people-screen"
      overlay={confirmOverlay}
    >
      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon color={BRAND}>
            <Ban size={20} color="#FFFFFF" strokeWidth={2.2} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>People you’ve blocked</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              They can’t message you or send a connection request.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : blockedPeople.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>You have not blocked anyone.</Text>
        </View>
      ) : (
        <View style={styles.list} testID="blocked-people-list">
          {blockedPeople.map((row, index) => (
            <Pressable
              key={row.id}
              disabled={unblockMutation.isPending}
              onPress={() => setUnblockTarget(row.person)}
              testID={`unblock-${row.person.id}`}
            >
              <View
                style={[styles.row, index > 0 ? styles.rowBorder : null]}
              >
                <UserAvatar
                  user={{
                    name: row.person.name ?? "Alenio member",
                    image: row.person.image,
                  }}
                  size={34}
                  radius={17}
                />
                <View style={styles.copy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.person.name ?? "Alenio member"}
                  </Text>
                  {row.person.username ? (
                    <Text style={styles.username} numberOfLines={1}>
                      @{row.person.username}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.unblockChip}>
                  <Text style={styles.unblockChipText}>Unblock</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 36,
    alignItems: "center",
  },
  empty: {
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#94A3B8",
    textAlign: "center",
  },
  list: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#0F172A",
  },
  username: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    color: "#94A3B8",
  },
  unblockChip: {
    minHeight: 30,
    paddingHorizontal: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1EFFF",
  },
  unblockChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: BRAND,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
    alignItems: "center",
  },
  confirmAvatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F0FF",
    borderWidth: 1,
    borderColor: "#E4E1FA",
  },
  confirmBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9F7F1",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  confirmTitle: {
    marginTop: 15,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.25,
    color: "#172033",
    textAlign: "center",
  },
  confirmBody: {
    maxWidth: 300,
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: "#718096",
    textAlign: "center",
  },
});
