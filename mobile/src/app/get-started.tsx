import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  ImageIcon,
  Trash2,
} from "lucide-react-native";
import { useGetStartedProgress } from "@/lib/use-get-started-progress";
import {
  getStartedHeadline,
  type GetStartedStep,
  type GetStartedStepId,
} from "@/lib/get-started-progress";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { pickImage, takePhoto } from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import { api } from "@/lib/api/api";
import { toast } from "burnt";
import { AddConnectionSheet } from "@/components/people/AddConnectionSheet";
import Svg, { Circle } from "react-native-svg";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";

function ProgressRing({
  percent,
  completedCount,
  totalCount,
}: {
  percent: number;
  completedCount: number;
  totalCount: number;
}) {
  const size = 74;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const boundedPercent = Math.max(0, Math.min(100, percent));

  return (
    <View
      style={styles.progressRing}
      accessible
      accessibilityLabel={`${boundedPercent} percent complete, ${completedCount} of ${totalCount} steps`}
    >
      <Svg width={size} height={size} style={styles.progressRingSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7F2"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#5367F7"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={
            circumference - (boundedPercent / 100) * circumference
          }
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.progressRingPercent}>{boundedPercent}%</Text>
      <Text style={styles.progressRingCount}>
        {completedCount} of {totalCount}
      </Text>
    </View>
  );
}

function openStep(id: GetStartedStepId) {
  switch (id) {
    case "username":
      router.push("/username");
      break;
    case "photo":
      break;
    case "connection":
      break;
    case "workspace":
      router.push("/onboarding");
      break;
    case "account":
      break;
  }
}

function ChecklistRow({
  step,
  onPress,
}: {
  step: GetStartedStep;
  onPress: () => void;
}) {
  const actionable = !step.complete && step.id !== "account";
  const content = (
    <View style={styles.stepRow}>
      <View style={[styles.stepStatus, step.complete ? styles.stepStatusComplete : null]}>
        {step.complete ? (
          <Check size={14} color="#21A861" strokeWidth={2.8} />
        ) : null}
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, step.complete ? styles.stepTitleComplete : null]}>
          {step.title}
        </Text>
        <Text style={styles.stepDescription}>{step.description}</Text>
      </View>
      {step.complete ? (
        <View style={styles.completedBadge}>
          <Text style={styles.completedLabel}>Completed</Text>
        </View>
      ) : actionable ? (
        <ChevronRight size={17} color="#B0B8C6" strokeWidth={2.1} />
      ) : null}
    </View>
  );

  if (!actionable) return content;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.rowPressed : null)}
      accessibilityRole="button"
      accessibilityLabel={`${step.title}. ${step.description}`}
      testID={`get-started-step-${step.id}`}
    >
      {content}
    </Pressable>
  );
}

export default function GetStartedScreen() {
  const queryClient = useQueryClient();
  const progress = useGetStartedProgress();
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [connectionSheetOpen, setConnectionSheetOpen] = useState(false);

  const refreshProfileIdentity = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({ queryKey: ["dms"] }),
      queryClient.invalidateQueries({ queryKey: ["messages"] }),
      queryClient.invalidateQueries({ queryKey: ["user-search"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
    ]);
  }, [queryClient]);

  const uploadPhoto = useMutation({
    mutationFn: async (source: "library" | "camera") => {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) throw new Error("cancelled");
      return uploadFile(file.uri, file.filename, file.mimeType, {
        purpose: "profile",
      });
    },
    onSuccess: async (uploaded) => {
      queryClient.setQueryData<MeUser | null>(ME_QUERY_KEY, (current) =>
        current ? { ...current, image: uploaded.url } : current,
      );
      await refreshProfileIdentity();
      toast({ title: "Profile photo updated", preset: "done" });
    },
    onError: (error: Error) => {
      if (error.message === "cancelled") return;
      toast({
        title: "Could not update photo",
        message: error.message,
        preset: "error",
      });
    },
  });

  const removePhoto = useMutation({
    mutationFn: () => api.patch<MeUser>("/api/profile", { image: null }),
    onSuccess: async () => {
      queryClient.setQueryData<MeUser | null>(ME_QUERY_KEY, (current) =>
        current ? { ...current, image: null } : current,
      );
      await refreshProfileIdentity();
      toast({ title: "Profile photo removed", preset: "done" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not remove photo",
        message: error.message,
        preset: "error",
      });
    },
  });

  const choosePhoto = (source: "library" | "camera") => {
    setPhotoSheetOpen(false);
    setTimeout(() => uploadPhoto.mutate(source), 280);
  };

  const removeCurrentPhoto = () => {
    setPhotoSheetOpen(false);
    setTimeout(() => removePhoto.mutate(), 280);
  };

  useFocusEffect(
    useCallback(() => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["connections"] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
      ]);
    }, [queryClient]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="get-started-back"
        >
          <ArrowLeft size={21} color="#27304D" strokeWidth={2.25} />
        </Pressable>
        <Text style={styles.headerTitle}>Get started</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!progress.isResolved ? (
        <View style={styles.loading} testID="get-started-loading">
          <ActivityIndicator color="#5367F7" />
          <Text style={styles.loadingText}>Updating your progress…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          testID="get-started-checklist"
        >
          <View style={styles.progressHeader}>
            <View style={styles.progressHero}>
              <View style={styles.progressHeroCopy}>
                <Text style={styles.progressHeadline}>
                  {getStartedHeadline(progress.remainingCount)}
                </Text>
                <Text style={styles.progressSupporting}>
                  Complete these steps to get the most{"\n"}out of Alenio.
                </Text>
              </View>
              <ProgressRing
                percent={progress.percent}
                completedCount={progress.completedCount}
                totalCount={progress.totalCount}
              />
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
          </View>

          <Text style={styles.sectionLabel}>GET STARTED</Text>
          <View style={styles.card}>
            {progress.steps.map((step, index) => (
              <View key={step.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <ChecklistRow
                  step={step}
                  onPress={() =>
                    step.id === "photo"
                      ? setPhotoSheetOpen(true)
                      : step.id === "connection"
                        ? setConnectionSheetOpen(true)
                      : openStep(step.id)
                  }
                />
              </View>
            ))}
          </View>

          <View style={styles.footerNote}>
            <View style={styles.footerIcon}>
              <SenecaIcon size={20} />
            </View>
            <View style={styles.footerCopy}>
              <Text style={styles.footerTitle}>We’ll keep this updated</Text>
              <Text style={styles.footerText}>
                As you complete steps, your progress will update automatically.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      <AlenioBottomSheet
        visible={photoSheetOpen}
        title="Profile Photo"
        subtitle="Update your profile picture"
        onClose={() => setPhotoSheetOpen(false)}
        compact
        scrollEnabled={false}
        testID="get-started-photo-sheet"
        footer={
          <Pressable
            onPress={() => setPhotoSheetOpen(false)}
            style={alenioSheetStyles.cancelButton}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        <AlenioSheetOption
          icon={<ImageIcon size={16} color="#FFFFFF" />}
          title="Choose from Library"
          subtitle="Pick an existing photo"
          onPress={() => choosePhoto("library")}
          testID="get-started-photo-library"
        />
        <AlenioSheetOption
          icon={<Camera size={16} color="#FFFFFF" />}
          title="Take Photo"
          subtitle="Use your camera"
          onPress={() => choosePhoto("camera")}
          testID="get-started-photo-camera"
        />
        {progress.steps.find((step) => step.id === "photo")?.complete ? (
          <AlenioSheetOption
            icon={<Trash2 size={16} color="#FFFFFF" />}
            title="Remove Photo"
            subtitle="Use your initials instead"
            onPress={removeCurrentPhoto}
            destructive
            testID="get-started-photo-remove"
          />
        ) : null}
      </AlenioBottomSheet>
      <AddConnectionSheet
        visible={connectionSheetOpen}
        onClose={() => setConnectionSheetOpen(false)}
        entryMode="all"
        hasWorkspaces={
          progress.steps.find((step) => step.id === "workspace")?.complete ===
          true
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EBF1",
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    color: "#172033",
    letterSpacing: -0.25,
  },
  headerSpacer: {
    width: 38,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  loadingText: {
    fontSize: 11,
    color: "#7B879A",
  },
  scroller: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },
  progressHeader: {
    marginBottom: 22,
  },
  progressHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  progressHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  progressHeadline: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#172033",
  },
  progressSupporting: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
    color: "#7B879A",
  },
  progressRing: {
    width: 74,
    height: 74,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingSvg: {
    position: "absolute",
  },
  progressRingPercent: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "800",
    color: "#5367F7",
  },
  progressRingCount: {
    marginTop: -1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    color: "#6F7A8D",
  },
  progressTrack: {
    height: 6,
    marginTop: 14,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: "#E4E7EF",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#5367F7",
  },
  sectionLabel: {
    marginLeft: 2,
    marginBottom: 7,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.75,
    color: "#7D8797",
  },
  card: {
    overflow: "hidden",
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3E7EF",
    backgroundColor: "#FFFFFF",
    shadowColor: "#334155",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  stepRow: {
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  stepStatus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#CBD2DD",
    backgroundColor: "#FFFFFF",
  },
  stepStatusComplete: {
    borderColor: "#E5F7ED",
    backgroundColor: "#EAF8F0",
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#263044",
  },
  stepTitleComplete: {
    color: "#4E596C",
  },
  stepDescription: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    color: "#8792A4",
  },
  completedBadge: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF8F0",
  },
  completedLabel: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    color: "#21A861",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 47,
    backgroundColor: "#E9ECF1",
  },
  rowPressed: {
    backgroundColor: "#F6F7FB",
  },
  footerNote: {
    marginTop: 18,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#F4F3FF",
    borderWidth: 1,
    borderColor: "#E8E5FF",
  },
  footerIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  footerCopy: {
    flex: 1,
    minWidth: 0,
  },
  footerTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: "#263044",
  },
  footerText: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 14,
    color: "#7B879A",
  },
});
