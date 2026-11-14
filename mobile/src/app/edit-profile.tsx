import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  UserRound,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { refreshMeInAuthCaches } from "@/lib/auth/use-session";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlenioBottomSheet,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { colors } from "@/theme";
import {
  clearProfileHeaderImage,
  profileHeaderSource,
} from "@/lib/profile-header";
import { useHeaderPhotoChooser } from "@/components/profile/use-header-photo";
import {
  HEADER_SIZE_NOTE,
  headerBannerHeight,
} from "@/lib/profile-header-frame";

const BRAND = colors.brand;

type EditableProfile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
  profileTitle: string | null;
  profileOrganization: string | null;
  profileWebsite: string | null;
  profileLocation: string | null;
  profileBio: string | null;
  profileHeaderImage: string | null;
};

type ProfileDraft = {
  name: string;
  profileTitle: string;
  profileOrganization: string;
  profileLocation: string;
  profileBio: string;
};

const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  profileTitle: "",
  profileOrganization: "",
  profileLocation: "",
  profileBio: "",
};

export default function EditProfileScreen() {
  const queryClient = useQueryClient();
  const window = useWindowDimensions();
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [headerPreviewWidth, setHeaderPreviewWidth] = useState(0);

  const { data: profile, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<EditableProfile>("/api/me"),
  });

  useEffect(() => {
    if (!profile) return;
    setDraft({
      name: profile.name ?? "",
      profileTitle: profile.profileTitle ?? "",
      profileOrganization: profile.profileOrganization ?? "",
      profileLocation: profile.profileLocation ?? "",
      profileBio: profile.profileBio ?? "",
    });
  }, [profile]);

  const refreshIdentity = async () => {
    await refreshMeInAuthCaches(queryClient);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["person"] }),
      queryClient.invalidateQueries({ queryKey: ["user-search"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({ queryKey: ["dms"] }),
      queryClient.invalidateQueries({ queryKey: ["activity"] }),
    ]);
  };

  const headerPhoto = useHeaderPhotoChooser({
    onSaved: async (url) => {
      queryClient.setQueryData<EditableProfile>(ME_QUERY_KEY, (current) =>
        current ? { ...current, profileHeaderImage: url } : current,
      );
      await refreshIdentity();
    },
  });

  const headerReset = useMutation({
    mutationFn: clearProfileHeaderImage,
    onSuccess: async () => {
      queryClient.setQueryData<EditableProfile>(ME_QUERY_KEY, (current) =>
        current ? { ...current, profileHeaderImage: null } : current,
      );
      await refreshIdentity();
    },
    onError: (err: unknown) => {
      Alert.alert(
        "Could not update header",
        err instanceof Error ? err.message : "Please try again.",
      );
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch<EditableProfile>("/api/profile", {
        name: draft.name,
        profileTitle: draft.profileTitle,
        profileOrganization: draft.profileOrganization,
        profileLocation: draft.profileLocation,
        profileBio: draft.profileBio,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      await refreshIdentity();
      toast({ title: "Public profile updated", preset: "done" });
      router.back();
    },
    onError: (err: unknown) => {
      Alert.alert(
        "Could not save profile",
        err instanceof Error ? err.message : "Please try again.",
      );
    },
  });

  const headerPreviewHeight =
    headerPreviewWidth > 0
      ? headerBannerHeight(headerPreviewWidth, {
          windowHeight: window.height,
        })
      : 148;
  const changed =
    !!profile &&
    (draft.name.trim() !== profile.name ||
      draft.profileTitle.trim() !== (profile.profileTitle ?? "") ||
      draft.profileOrganization.trim() !== (profile.profileOrganization ?? "") ||
      draft.profileLocation.trim() !== (profile.profileLocation ?? "") ||
      draft.profileBio.trim() !== (profile.profileBio ?? ""));
  const canSave = changed && draft.name.trim().length > 0 && !save.isPending;

  const handleClose = () => router.back();

  return (
    <AlenioBottomSheet
      asScreen
      title="Edit profile"
      subtitle="How you appear to people on Alenio"
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      showMoreIndicator
      bodyHeightRatio={0.82}
      testID="edit-profile-screen"
      footer={
        <>
          <TouchableOpacity
            testID="edit-profile-save"
            onPress={() => save.mutate()}
            disabled={!canSave}
            style={[
              alenioSheetStyles.primaryButton,
              { backgroundColor: BRAND },
              !canSave ? alenioSheetStyles.primaryButtonDisabled : null,
            ]}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
          >
            {save.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>Save profile</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClose}
            style={alenioSheetStyles.cancelButton}
            testID="edit-profile-cancel"
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      }
    >
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <View style={styles.content}>
          {headerPhoto.sheet}
          <Text style={styles.sectionTitle}>Header</Text>
          <Pressable
            onLayout={(event) => {
              const width = Math.round(event.nativeEvent.layout.width);
              setHeaderPreviewWidth((current) =>
                current === width ? current : width,
              );
            }}
            onPress={() => {
              void headerPhoto.choose();
            }}
            disabled={headerPhoto.busy || headerReset.isPending}
            style={[styles.headerPreview, { height: headerPreviewHeight }]}
            accessibilityRole="button"
            accessibilityLabel="Edit header"
            testID="edit-profile-header"
          >
            {headerPreviewWidth > 0 ? (
              <Image
                source={profileHeaderSource(profile?.profileHeaderImage, {
                  wide: window.width / Math.max(window.height, 1) >= 1.2,
                })}
                style={{ width: headerPreviewWidth, height: headerPreviewHeight }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ height: headerPreviewHeight }} />
            )}
            <View style={styles.headerEdit}>
              {headerPhoto.busy ? (
                <ActivityIndicator color="#111A2B" size="small" />
              ) : (
                <>
                  <Pencil size={14} color="#111A2B" strokeWidth={2.3} />
                  <Text style={styles.headerEditText}>Edit</Text>
                </>
              )}
            </View>
          </Pressable>
          <Text style={styles.headerNote} testID="edit-profile-header-note">
            {HEADER_SIZE_NOTE}
          </Text>
          {profile?.profileHeaderImage ? (
            <Pressable
              onPress={() => {
                Alert.alert(
                  "Remove header?",
                  "This removes the custom header you uploaded and restores the default.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove header",
                      style: "destructive",
                      onPress: () => headerReset.mutate(),
                    },
                  ],
                );
              }}
              disabled={headerReset.isPending || headerPhoto.busy}
              style={styles.headerReset}
              accessibilityRole="button"
              testID="edit-profile-header-reset"
            >
              <Text style={styles.headerResetText}>
                {headerReset.isPending ? "Removing…" : "Remove header"}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.heroCard}>
            <UserAvatar
              user={{ name: draft.name, image: profile?.image }}
              size={64}
              radius={32}
              backgroundColor="#EEF2FF"
              textColor={BRAND}
              fontSize={22}
            />
            <View style={styles.heroIdentity}>
              <Text style={styles.heroName} numberOfLines={1}>
                {draft.name || "Your profile"}
              </Text>
              <Text style={styles.heroUsername} numberOfLines={1}>
                {profile?.username
                  ? `@${profile.username}`
                  : "Choose a username"}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Profile details</Text>
          <View style={styles.formCard}>
            <Field
              icon={<UserRound size={16} color={BRAND} />}
              label="Display name"
              value={draft.name}
              maxLength={80}
              onChangeText={(name) =>
                setDraft((current) => ({ ...current, name }))
              }
              testID="edit-profile-name"
            />
            <Divider />
            <Pressable
              onPress={() => router.push("/username")}
              style={styles.usernameRow}
              testID="edit-profile-username"
            >
              <View style={styles.fieldIcon}>
                <AtSign size={16} color={BRAND} />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.label}>Username</Text>
                <Text style={styles.usernameValue}>
                  {profile?.username
                    ? `@${profile.username}`
                    : "Choose a username"}
                </Text>
              </View>
              <ChevronRight size={17} color="#A7B0C0" />
            </Pressable>
            <Divider />
            <Field
              icon={<BriefcaseBusiness size={16} color="#718097" />}
              label="Title"
              value={draft.profileTitle}
              placeholder="e.g. Operations Manager"
              maxLength={80}
              onChangeText={(profileTitle) =>
                setDraft((current) => ({ ...current, profileTitle }))
              }
              testID="edit-profile-title"
            />
            <Divider />
            <Field
              icon={<Building2 size={16} color="#718097" />}
              label="Employer"
              value={draft.profileOrganization}
              placeholder="e.g. Northstar Hospitality"
              maxLength={80}
              onChangeText={(profileOrganization) =>
                setDraft((current) => ({ ...current, profileOrganization }))
              }
              testID="edit-profile-employer"
            />
            <Divider />
            <Field
              icon={<MapPin size={16} color="#718097" />}
              label="Location"
              value={draft.profileLocation}
              placeholder="e.g. Austin, TX"
              maxLength={100}
              onChangeText={(profileLocation) =>
                setDraft((current) => ({ ...current, profileLocation }))
              }
            />
          </View>

          <View style={styles.aboutHeader}>
            <Text style={styles.sectionTitle}>About you</Text>
            <Text style={styles.counter}>{draft.profileBio.length}/500</Text>
          </View>
          <View style={styles.bioCard}>
            <View style={styles.bioIcon}>
              <FileText size={16} color="#718097" />
            </View>
            <TextInput
              value={draft.profileBio}
              onChangeText={(profileBio) =>
                setDraft((current) => ({ ...current, profileBio }))
              }
              placeholder="Add a concise professional summary"
              placeholderTextColor="#A0AABB"
              multiline
              maxLength={500}
              autoCapitalize="sentences"
              textAlignVertical="top"
              style={styles.bioInput}
              testID="edit-profile-bio"
            />
          </View>
          <Text style={styles.helper}>
            This information is visible to other authenticated Alenio users.
          </Text>
        </View>
      )}
    </AlenioBottomSheet>
  );
}

function Field({
  icon,
  label,
  value,
  placeholder,
  maxLength,
  onChangeText,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  onChangeText: (value: string) => void;
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldIcon}>{icon}</View>
      <View style={styles.fieldContent}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#A0AABB"
          maxLength={maxLength}
          autoCapitalize="words"
          autoCorrect
          keyboardType="default"
          textContentType="none"
          style={styles.input}
          testID={testID}
        />
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  content: {
    gap: 0,
    paddingBottom: 4,
  },
  headerPreview: {
    width: "100%",
    marginBottom: 8,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#D7E0EE",
  },
  headerEdit: {
    position: "absolute",
    right: 10,
    bottom: 10,
    minWidth: 72,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  headerEditText: {
    color: "#111A2B",
    fontSize: 13,
    fontWeight: "700",
  },
  headerNote: {
    marginBottom: 12,
    paddingHorizontal: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#667085",
  },
  headerReset: {
    alignSelf: "center",
    marginTop: -4,
    marginBottom: 12,
    paddingVertical: 2,
  },
  headerResetText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  centered: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  heroUsername: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  sectionTitle: {
    marginLeft: 2,
    marginBottom: 8,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#536175",
  },
  formCard: {
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    overflow: "hidden",
  },
  field: {
    minHeight: 58,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#F1F4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldContent: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: "#8290A4",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  input: {
    marginTop: 2,
    padding: 0,
    fontSize: 13,
    fontWeight: "600",
    color: "#172033",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E8ECF2",
    marginLeft: 53,
  },
  usernameRow: {
    minHeight: 58,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  usernameValue: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
    color: "#334155",
  },
  aboutHeader: {
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: { fontSize: 10, fontWeight: "600", color: "#94A3B8" },
  bioCard: {
    minHeight: 126,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  bioIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4FF",
  },
  bioInput: {
    flex: 1,
    minHeight: 100,
    padding: 0,
    fontSize: 12.5,
    lineHeight: 19,
    color: "#334155",
  },
  helper: {
    marginTop: 8,
    paddingHorizontal: 3,
    fontSize: 10,
    lineHeight: 14,
    color: "#94A3B8",
  },
});
