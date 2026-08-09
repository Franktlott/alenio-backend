import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AtSign,
  Camera,
  ChevronRight,
  FileText,
  Link2,
  MapPin,
  UserRound,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { refreshMeInAuthCaches } from "@/lib/auth/use-session";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";
import { UserAvatar } from "@/components/UserAvatar";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";

type EditableProfile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
  profileWebsite: string | null;
  profileLocation: string | null;
  profileBio: string | null;
};

type ProfileDraft = {
  name: string;
  profileWebsite: string;
  profileLocation: string;
  profileBio: string;
};

const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  profileWebsite: "",
  profileLocation: "",
  profileBio: "",
};

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [localImage, setLocalImage] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<EditableProfile>("/api/me"),
  });

  useEffect(() => {
    if (!profile) return;
    setDraft({
      name: profile.name ?? "",
      profileWebsite: profile.profileWebsite ?? "",
      profileLocation: profile.profileLocation ?? "",
      profileBio: profile.profileBio ?? "",
    });
    setLocalImage(profile.image ?? null);
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

  const save = useMutation({
    mutationFn: () =>
      api.patch<EditableProfile>("/api/profile", {
        name: draft.name,
        profileWebsite: draft.profileWebsite,
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
      Alert.alert("Could not save profile", err instanceof Error ? err.message : "Please try again.");
    },
  });

  const uploadPhoto = useMutation({
    mutationFn: async (source: "library" | "camera") => {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) throw new Error("cancelled");
      setLocalImage(file.uri);
      return uploadFile(file.uri, file.filename, file.mimeType, { purpose: "profile" });
    },
    onSuccess: async (uploaded) => {
      setLocalImage(uploaded.url);
      await refreshIdentity();
      toast({ title: "Profile photo updated", preset: "done" });
    },
    onError: (err: Error) => {
      setLocalImage(profile?.image ?? null);
      if (err.message !== "cancelled") Alert.alert("Could not update photo", err.message);
    },
  });

  const choosePhoto = () => {
    Alert.alert("Profile photo", "Choose a photo source.", [
      { text: "Photo Library", onPress: () => uploadPhoto.mutate("library") },
      { text: "Camera", onPress: () => uploadPhoto.mutate("camera") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const changed =
    !!profile &&
    (draft.name.trim() !== profile.name ||
      draft.profileWebsite.trim() !== (profile.profileWebsite ?? "") ||
      draft.profileLocation.trim() !== (profile.profileLocation ?? "") ||
      draft.profileBio.trim() !== (profile.profileBio ?? ""));
  const canSave = changed && draft.name.trim().length > 0 && !save.isPending;

  return (
    <SafeKeyboardAvoidingView style={styles.screen}>
      <LinearGradient
        colors={["#4361EE", "#6D38E8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 4 }]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <ArrowLeft size={21} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit profile</Text>
          <Pressable
            onPress={() => save.mutate()}
            disabled={!canSave}
            style={styles.saveButton}
            testID="edit-profile-save"
          >
            {save.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  !canSave ? styles.saveTextDisabled : null,
                ]}
              >
                Save
              </Text>
            )}
          </Pressable>
        </View>

        {!isLoading ? (
          <View style={styles.heroProfile}>
            <Pressable
              onPress={choosePhoto}
              style={styles.photoButton}
              testID="edit-profile-photo"
            >
              <View style={styles.avatarFrame}>
                <UserAvatar
                  user={{ name: draft.name, image: localImage }}
                  size={76}
                  radius={38}
                  backgroundColor="#6366F1"
                  textColor="#FFFFFF"
                  fontSize={27}
                />
              </View>
              <View style={styles.cameraBadge}>
                {uploadPhoto.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Camera size={13} color="#FFFFFF" />
                )}
              </View>
            </Pressable>
            <View style={styles.heroIdentity}>
              <Text style={styles.heroName} numberOfLines={1}>
                {draft.name || "Your profile"}
              </Text>
              <Text style={styles.heroUsername} numberOfLines={1}>
                {profile?.username
                  ? `@${profile.username}`
                  : "Choose a username"}
              </Text>
              <Pressable onPress={choosePhoto} hitSlop={6}>
                <Text style={styles.changePhoto}>Change photo</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.heroPlaceholder} />
        )}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color="#4361EE" /></View>
      ) : (
        <ScrollView
          style={styles.profileScroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Profile details</Text>
          <View style={styles.formCard}>
            <Field
              icon={<UserRound size={16} color="#4361EE" />}
              label="Display name"
              value={draft.name}
              maxLength={80}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              testID="edit-profile-name"
            />
            <Divider />
            <Pressable
              onPress={() => router.push("/username")}
              style={styles.usernameRow}
              testID="edit-profile-username"
            >
              <View style={styles.fieldIcon}>
                <AtSign size={16} color="#4361EE" />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.label}>Username</Text>
                <Text style={styles.usernameValue}>
                  {profile?.username ? `@${profile.username}` : "Choose a username"}
                </Text>
              </View>
              <ChevronRight size={17} color="#A7B0C0" />
            </Pressable>
            <Divider />
            <Field
              icon={<Link2 size={16} color="#718097" />}
              label="Website"
              value={draft.profileWebsite}
              placeholder="e.g. alenio.com"
              maxLength={2048}
              autoCapitalize="none"
              keyboardType="url"
              onChangeText={(profileWebsite) =>
                setDraft((current) => ({ ...current, profileWebsite }))
              }
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
              textAlignVertical="top"
              style={styles.bioInput}
              testID="edit-profile-bio"
            />
          </View>
          <Text style={styles.helper}>
            This information is visible to other authenticated Alenio users.
          </Text>
        </ScrollView>
      )}
    </SafeKeyboardAvoidingView>
  );
}

function Field({
  icon,
  label,
  value,
  placeholder,
  maxLength,
  autoCapitalize,
  keyboardType,
  onChangeText,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "url";
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
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
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
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  hero: {
    paddingBottom: 29,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 44,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  saveButton: {
    width: 52,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  saveText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  saveTextDisabled: { color: "rgba(255,255,255,0.45)" },
  heroProfile: {
    minHeight: 96,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  heroPlaceholder: { height: 96 },
  photoButton: {
    position: "relative",
  },
  avatarFrame: {
    padding: 3,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#172033",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cameraBadge: {
    position: "absolute",
    right: -1,
    bottom: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#4361EE",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.35,
  },
  heroUsername: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
  },
  changePhoto: {
    marginTop: 7,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileScroll: {
    marginTop: -22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    backgroundColor: "#FFFFFF",
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
    lineHeight: 18,
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
    marginTop: 20,
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
  helper: { marginTop: 8, paddingHorizontal: 3, fontSize: 10, lineHeight: 14, color: "#94A3B8" },
});
