import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StatusBar, StyleSheet, Image, Linking, Share, TextInput, Modal, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, PanResponder, useWindowDimensions, Animated as RNAnimated, Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
// Deep links come from expo-linking; the react-native Linking above only
// opens URLs and settings.
import * as ExpoLinking from "expo-linking";
import { useLocalSearchParams, router, useNavigation } from "expo-router";
import {
  Check,
  ChevronLeft,
  Hand,
  Mail,
  Mic,
  MicOff,
  Monitor,
  MoreHorizontal,
  PhoneOff,
  Pin,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Smile,
  SwitchCamera,
  UserMinus,
  Users,
  Video,
  VideoOff,
  VolumeX,
  X,
} from "lucide-react-native";
import Daily, {
  DailyMediaView,
  type DailyCall,
} from "@daily-co/react-native-daily-js";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { api } from "@/lib/api/api";
import { useCallTranscription } from "@/hooks/use-call-transcription";
import { UserAvatar } from "@/components/UserAvatar";
import { MeetingCheckInTool } from "@/components/video/MeetingCheckInTool";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import {
  MEETING_REACTIONS,
  parseMeetingSignal,
  selectFeaturedParticipantId,
  type MeetingReaction,
} from "@/lib/video-meeting-experience";

const alenioLogo = require("@/assets/alenio-logo-white.png");

type Phase = "prejoin" | "connecting" | "incall" | "error";
type DailyParticipants = ReturnType<DailyCall["participants"]>;
type DailyParticipant = DailyParticipants[string];
type ReactionBubble = {
  id: string;
  reaction: MeetingReaction;
  senderName: string;
};

function participantVideoTrack(participant: DailyParticipant | undefined) {
  return participant?.tracks?.video?.persistentTrack ?? null;
}

function participantAudioTrack(participant: DailyParticipant | undefined) {
  return participant?.tracks?.audio?.persistentTrack ?? null;
}

/**
 * A shared screen arrives on its own pair of tracks, separate from the camera.
 * Both are checked for "playable" so a track left behind after someone stops
 * sharing cannot hold a frozen frame on the stage.
 */
function participantScreenTracks(participant: DailyParticipant | undefined) {
  const video = participant?.tracks?.screenVideo;
  const audio = participant?.tracks?.screenAudio;
  return {
    video: video?.state === "playable" ? (video.persistentTrack ?? null) : null,
    audio: audio?.state === "playable" ? (audio.persistentTrack ?? null) : null,
  };
}

function participantHasRaisedHand(participant: DailyParticipant | undefined) {
  if (!participant?.userData || typeof participant.userData !== "object") {
    return false;
  }
  return (
    (participant.userData as { alenioHandRaised?: unknown }).alenioHandRaised ===
    true
  );
}

type ScreenTracks = ReturnType<typeof participantScreenTracks>;

/**
 * A shared screen takes the whole stage. It is fitted rather than filled: a
 * cropped screen share loses the edges of whatever is being pointed at.
 */
function ScreenShareStage({
  videoTrack,
  audioTrack,
  sharerName,
}: {
  videoTrack: NonNullable<ScreenTracks["video"]>;
  audioTrack: ScreenTracks["audio"];
  sharerName: string;
}) {
  return (
    <View style={s.screenShareStage} testID="screen-share-stage">
      <DailyMediaView
        videoTrack={videoTrack}
        audioTrack={audioTrack}
        objectFit="contain"
        style={s.remoteTileVideo}
      />
      <View style={s.screenShareBadge}>
        <Monitor size={11} color="#FFFFFF" />
        <Text style={s.screenShareBadgeText} numberOfLines={1}>
          {`${sharerName} is sharing`}
        </Text>
      </View>
    </View>
  );
}

function remoteTileStyle(index: number, count: number) {
  if (count === 1) {
    return { width: "100%" as const, height: "100%" as const };
  }
  if (count === 2) {
    return { width: "100%" as const, height: "50%" as const };
  }

  const rows = Math.ceil(count / 2);
  const isLastOddTile = count % 2 === 1 && index === count - 1;
  return {
    width: isLastOddTile ? ("100%" as const) : ("50%" as const),
    height: `${100 / rows}%` as `${number}%`,
  };
}

function RemoteParticipantTile({
  participant,
  index,
  count,
  containVideo,
  active,
  pinned,
  handRaised,
  onPress,
}: {
  participant: DailyParticipant;
  index: number;
  count: number;
  containVideo: boolean;
  active: boolean;
  pinned: boolean;
  handRaised: boolean;
  onPress: () => void;
}) {
  const videoTrack = participantVideoTrack(participant);
  const audioTrack = participantAudioTrack(participant);
  const displayName = participant.user_name?.trim() || "Participant";

  return (
    <Pressable
      onPress={onPress}
      style={[
        s.remoteTile,
        remoteTileStyle(index, count),
        active ? s.remoteTileActive : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${pinned ? "Unpin" : "Pin"} ${displayName}`}
    >
      {videoTrack ? (
        <DailyMediaView
          videoTrack={videoTrack}
          audioTrack={audioTrack}
          objectFit={containVideo ? "contain" : "cover"}
          style={s.remoteTileVideo}
        />
      ) : (
        <>
          {audioTrack ? (
            <DailyMediaView
              videoTrack={null}
              audioTrack={audioTrack}
              style={s.remoteTileAudio}
            />
          ) : null}
          <View style={s.remoteTileAvatar}>
            <Text style={s.remoteTileInitial}>
              {(displayName[0] || "A").toUpperCase()}
            </Text>
          </View>
          <Text style={s.remoteTileName}>{displayName}</Text>
          <Text style={s.remoteTileStatus}>Camera is off</Text>
        </>
      )}
      {videoTrack && count > 1 ? (
        <View style={s.remoteTileNameBadge}>
          {pinned ? <Pin size={10} color="#FFFFFF" fill="#FFFFFF" /> : null}
          {handRaised ? <Text style={s.remoteTileHand}>✋</Text> : null}
          <Text style={s.remoteTileNameBadgeText} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
      ) : null}
      {!videoTrack && handRaised ? (
        <View style={s.remoteTileRaisedHand}>
          <Text style={s.remoteTileRaisedHandText}>✋</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function VideoCallScreen() {
  const { roomId, roomName } = useLocalSearchParams<{ roomId: string; roomName: string }>();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [phase, setPhase] = useState<Phase>("prejoin");
  const callRef = useRef<DailyCall | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [participants, setParticipants] =
    useState<DailyParticipants | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"front" | "rear">("front");
  const [error, setError] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const [meetingToolsOpen, setMeetingToolsOpen] = useState(false);
  const [checkInToolsAvailable, setCheckInToolsAvailable] = useState(false);
  const [checkInFormActive, setCheckInFormActive] = useState(false);
  const draftSaverRef = useRef<(() => Promise<void>) | null>(null);
  const interruptedConnectionsRef = useRef(new Set<string>());
  const reactionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(
    null,
  );
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [localHandRaised, setLocalHandRaised] = useState(false);
  const [reactionBubbles, setReactionBubbles] = useState<ReactionBubble[]>([]);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [serverHost, setServerHost] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<
    "good" | "warning" | "bad" | "unknown"
  >("unknown");
  const previewPosition = useRef(
    new RNAnimated.ValueXY({
      x: Math.max(14, screenWidth - 114),
      y: insets.top + 82,
    }),
  ).current;
  const previewOriginRef = useRef({ x: screenWidth - 114, y: insets.top + 82 });
  const previewCurrentRef = useRef(previewOriginRef.current);

  const previewPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          previewPosition.stopAnimation((value) => {
            previewOriginRef.current = value;
            previewCurrentRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const minY = insets.top + 70;
          const videoBottom = checkInFormActive
            ? screenHeight * 0.36
            : screenHeight - (71 + Math.max(insets.bottom, 14));
          const maxX = Math.max(14, screenWidth - 114);
          const maxY = Math.max(minY, videoBottom - 146);
          const next = {
            x: Math.max(
              14,
              Math.min(maxX, previewOriginRef.current.x + gesture.dx),
            ),
            y: Math.max(
              minY,
              Math.min(maxY, previewOriginRef.current.y + gesture.dy),
            ),
          };
          previewCurrentRef.current = next;
          previewPosition.setValue(next);
        },
        onPanResponderRelease: () => {
          const snapX =
            previewCurrentRef.current.x + 50 < screenWidth / 2
              ? 14
              : Math.max(14, screenWidth - 114);
          RNAnimated.spring(previewPosition, {
            toValue: { x: snapX, y: previewCurrentRef.current.y },
            useNativeDriver: true,
          }).start(() => {
            previewCurrentRef.current = {
              x: snapX,
              y: previewCurrentRef.current.y,
            };
          });
        },
      }),
    [
      checkInFormActive,
      insets.bottom,
      insets.top,
      previewPosition,
      screenHeight,
      screenWidth,
    ],
  );
  const userName = authReady?.me?.name ?? session?.user?.name ?? "Guest";
  const userImage = authReady?.me?.image ?? session?.user?.image ?? null;
  const userEmail = authReady?.me?.email ?? session?.user?.email ?? null;

  // Email invite state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.03, { duration: 950 }), withTiming(1, { duration: 950 })),
      -1, false
    );
    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 950 }), withTiming(0.4, { duration: 950 })),
      -1, false
    );
  }, []);

  const joinBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    shadowOpacity: glowOpacity.value,
  }));

  const goBack = useCallback(() => {
    router.back();
  }, []);

  const handleDraftSaveReady = useCallback(
    (saveDraft: (() => Promise<void>) | null) => {
      draftSaverRef.current = saveDraft;
    },
    [],
  );

  const refreshParticipants = useCallback(() => {
    const call = callRef.current;
    if (call) setParticipants({ ...call.participants() });
  }, []);

  const showReaction = useCallback(
    (reaction: MeetingReaction, senderName: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      setReactionBubbles((current) => [
        ...current.slice(-3),
        { id, reaction, senderName },
      ]);
      const timer = setTimeout(() => {
        setReactionBubbles((current) =>
          current.filter((bubble) => bubble.id !== id),
        );
      }, 2600);
      reactionTimersRef.current.push(timer);
    },
    [],
  );

  const handleAppMessage = useCallback(
    (event: { data?: unknown; fromId?: string }) => {
      const signal = parseMeetingSignal(event.data);
      if (!signal || !event.fromId) return;
      if (signal.type === "reaction") {
        showReaction(signal.reaction, signal.senderName);
      } else if (signal.type === "hand") {
        setRaisedHands((current) => ({
          ...current,
          [event.fromId as string]: signal.raised,
        }));
      } else if (
        signal.type === "end-for-all" &&
        callRef.current?.participants()[event.fromId]?.owner
      ) {
        void callRef.current.leave().finally(() => router.back());
      }
    },
    [showReaction],
  );

  useEffect(() => {
    const call = Daily.createCallObject({
      allowMultipleCallInstances: true,
      reactNativeConfig: {
        androidInCallNotification: {
          title: roomName ?? "Alenio video call",
          subtitle: "Video call in progress",
        },
      },
    });
    callRef.current = call;
    const participantEvents = [
      "participant-joined",
      "participant-updated",
      "participant-left",
    ] as const;
    const handleCallError = (event: {
      error?: { type?: string };
      errorMsg?: string;
    }) => {
      const errorType = event.error?.type;
      if (errorType !== "ejected" && errorType !== "connection-error") return;
      interruptedConnectionsRef.current.clear();
      setReconnecting(false);
      setError(
        errorType === "ejected"
          ? "The meeting host removed you from this meeting."
          : event.errorMsg || "The call could not reconnect.",
      );
      setPhase("error");
    };
    participantEvents.forEach((event) =>
      call.on(event, refreshParticipants),
    );
    call.on("joined-meeting", refreshParticipants);
    call.on("left-meeting", refreshParticipants);
    call.on("active-speaker-change", (event) => {
      setActiveSpeakerId(event.activeSpeaker.peerId || null);
    });
    call.on("app-message", handleAppMessage);
    call.on("error", handleCallError);
    call.on("network-quality-change", (event) => {
      setNetworkQuality(event.networkState);
    });
    call.on("network-connection", (event) => {
      const key = `${event.type}:${event.session_id ?? event.sfu_id ?? "call"}`;
      if (event.event === "interrupted") {
        interruptedConnectionsRef.current.add(key);
      } else {
        interruptedConnectionsRef.current.delete(key);
      }
      setReconnecting(interruptedConnectionsRef.current.size > 0);
    });
    return () => {
      participantEvents.forEach((event) =>
        call.off(event, refreshParticipants),
      );
      call.off("joined-meeting", refreshParticipants);
      call.off("left-meeting", refreshParticipants);
      call.off("app-message", handleAppMessage);
      call.off("error", handleCallError);
      reactionTimersRef.current.forEach(clearTimeout);
      reactionTimersRef.current = [];
      void call.destroy();
      callRef.current = null;
    };
  }, [handleAppMessage, refreshParticipants, roomName]);

  useEffect(() => {
    async function fetchRoom() {
      if (!roomId) {
        setError("Missing room.");
        setPhase("error");
        return;
      }
      try {
        const data = await api.post<{
          url: string;
          token: string;
          isHost?: boolean;
        }>("/api/video/room", {
          roomId,
          userName,
        });
        if (!data?.url || !data?.token) {
          setError("Could not start call.");
          setPhase("error");
          return;
        }
        setShareUrl(data.url);
        setRoomUrl(data.url);
        setRoomToken(data.token);
        setServerHost(data.isHost === true);
        setRoomReady(true);
      } catch {
        setError("Could not connect. Please try again.");
        setPhase("error");
      }
    }
    void fetchRoom();
  }, [roomId, userName]);

  useEffect(() => {
    const call = callRef.current;
    if (
      phase !== "incall" ||
      !roomReady ||
      !roomUrl ||
      !roomToken ||
      !call ||
      call.meetingState() === "joined-meeting" ||
      call.meetingState() === "joining-meeting"
    ) {
      return;
    }

    let cancelled = false;
    setPhase("connecting");
    void call
      .join({ url: roomUrl, token: roomToken, userName })
      .then(() => {
        if (cancelled) return;
        call.setLocalVideo(cameraEnabled);
        call.setLocalAudio(microphoneEnabled);
        refreshParticipants();
        setPhase("incall");
      })
      .catch(() => {
        if (cancelled) return;
        setError("The call refreshed. Please rejoin.");
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    cameraEnabled,
    microphoneEnabled,
    phase,
    refreshParticipants,
    roomReady,
    roomToken,
    roomUrl,
    userName,
  ]);

  useEffect(() => {
    if (!roomId || !session?.user) return;
    let active = true;
    api
      .get<{ eligiblePairs: unknown[] }>(
        `/api/video/room/${encodeURIComponent(roomId)}/check-in-context`,
      )
      .then((context) => {
        if (active) setCheckInToolsAvailable(context.eligiblePairs.length > 0);
      })
      .catch(() => {
        if (active) setCheckInToolsAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [roomId, session?.user]);

  async function requestPermissionsAndJoin() {
    const call = callRef.current;
    if (!roomReady || !roomUrl || !roomToken || !call) return;
    const cam = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!cam?.granted) { setPermissionDenied(true); return; }
    await new Promise(r => setTimeout(r, 300));
    const mic = micPermission?.granted ? micPermission : await requestMicPermission();
    if (!mic?.granted) { setPermissionDenied(true); return; }
    setPhase("connecting");
    try {
      await call.join({
        url: roomUrl,
        token: roomToken,
        userName,
      });
      call.setLocalVideo(false);
      call.setLocalAudio(false);
      refreshParticipants();
      setPhase("incall");
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Could not join the video call.",
      );
      setPhase("error");
    }
  }

  const participantList = useMemo(
    () => (participants ? Object.values(participants) : []),
    [participants],
  );
  const localParticipant = participantList.find(
    (participant) => participant.local,
  );
  const remoteParticipants = participantList.filter(
    (participant) => !participant.local,
  );
  const remoteParticipantIds = remoteParticipants.map(
    (participant) => participant.session_id,
  );
  const featuredParticipantId = selectFeaturedParticipantId({
    pinnedParticipantId,
    activeSpeakerId,
    participantIds: remoteParticipantIds,
  });
  const featuredParticipant =
    remoteParticipants.find(
      (participant) => participant.session_id === featuredParticipantId,
    ) ?? null;
  const filmstripParticipants = featuredParticipant
    ? remoteParticipants.filter(
        (participant) =>
          participant.session_id !== featuredParticipant.session_id,
      )
    : [];
  // A shared screen outranks the active speaker for the stage: it is the thing
  // everyone is being asked to look at.
  const screenShare =
    remoteParticipants
      .map((participant) => {
        const { video, audio } = participantScreenTracks(participant);
        return video ? { participant, video, audio } : null;
      })
      .find((entry): entry is NonNullable<typeof entry> => entry !== null) ??
    null;
  useEffect(() => {
    if (
      pinnedParticipantId &&
      !remoteParticipantIds.includes(pinnedParticipantId)
    ) {
      setPinnedParticipantId(null);
    }
  }, [pinnedParticipantId, remoteParticipantIds]);
  const activeParticipantUserIds = remoteParticipants
    .map((participant) => participant.user_id)
    .filter((userId): userId is string => typeof userId === "string");
  const localVideoTrack = participantVideoTrack(localParticipant);
  const isMeetingHost = serverHost || localParticipant?.owner === true;

  // Live notes: Daily transcribes the call so the leader can have Seneca draft
  // the check-in from what was actually said instead of typing during it.
  const getCall = useCallback(() => callRef.current, []);
  const transcription = useCallTranscription({
    getCall,
    canControl: isMeetingHost,
  });
  const [liveNotesConsentOpen, setLiveNotesConsentOpen] = useState(false);
  const transcriptionActive =
    transcription.status === "active" || transcription.status === "starting";

  const leaveCall = async () => {
    try {
      await draftSaverRef.current?.();
    } catch {
      // Leaving the call remains available if a background draft save fails.
    }
    try {
      await callRef.current?.leave();
    } finally {
      setParticipants(null);
      goBack();
    }
  };

  const toggleCamera = () => {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    callRef.current?.setLocalVideo(next);
  };

  const toggleMicrophone = () => {
    const next = !microphoneEnabled;
    setMicrophoneEnabled(next);
    callRef.current?.setLocalAudio(next);
  };

  const switchCamera = () => {
    void callRef.current?.cycleCamera();
    setCameraFacing((current) => (current === "front" ? "rear" : "front"));
  };

  const sendReaction = (reaction: MeetingReaction) => {
    const call = callRef.current;
    if (!call || call.meetingState() !== "joined-meeting") return;
    const signal = {
      type: "reaction" as const,
      reaction,
      senderName: userName,
      sentAt: Date.now(),
    };
    showReaction(reaction, userName);
    call.sendAppMessage(signal, "*");
    setReactionPickerOpen(false);
  };

  const toggleRaisedHand = () => {
    const call = callRef.current;
    if (!call || call.meetingState() !== "joined-meeting") return;
    const raised = !localHandRaised;
    setLocalHandRaised(raised);
    const signal = {
      type: "hand" as const,
      raised,
      senderName: userName,
      sentAt: Date.now(),
    };
    call.sendAppMessage(signal, "*");
    void call.setUserData({ alenioHandRaised: raised });
  };

  const shareMeetingLink = () => {
    if (!roomId) return;
    const appJoinUrl = ExpoLinking.createURL("/video-call", {
      queryParams: {
        roomId,
        roomName: roomName ?? "Video Call",
      },
    });
    void Share.share({
      message: appJoinUrl,
      url: appJoinUrl,
      title: `Join ${roomName ?? "Video Call"}`,
    });
  };

  const muteRemoteParticipant = (participant: DailyParticipant) => {
    callRef.current?.updateParticipant(participant.session_id, {
      setAudio: false,
    });
  };

  const removeRemoteParticipant = (participant: DailyParticipant) => {
    const displayName = participant.user_name?.trim() || "this participant";
    Alert.alert(
      "Remove participant?",
      participant.user_id
        ? `${displayName} will be disconnected and cannot rejoin this meeting session.`
        : `${displayName} will be disconnected from this meeting.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void api
              .post(
                `/api/video/room/${encodeURIComponent(roomId ?? "")}/participants/remove`,
                {
                  sessionId: participant.session_id,
                  userId: participant.user_id ?? null,
                },
              )
              .catch(() => {
                Alert.alert(
                  "Couldn’t remove participant",
                  "Please check your connection and try again.",
                );
              });
          },
        },
      ],
    );
  };

  const endMeetingForEveryone = () => {
    Alert.alert(
      "End meeting for everyone?",
      "Everyone will be disconnected. The meeting link can be used again later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End for everyone",
          style: "destructive",
          onPress: () => {
            const call = callRef.current;
            if (!call) return;
            call.sendAppMessage(
              { type: "end-for-all", sentAt: Date.now() },
              "*",
            );
            const updates = Object.fromEntries(
              remoteParticipants.map((participant) => [
                participant.session_id,
                { eject: true as const },
              ]),
            );
            if (Object.keys(updates).length > 0) call.updateParticipants(updates);
            setTimeout(() => void leaveCall(), 120);
          },
        },
      ],
    );
  };

  const meetingFormHeaderControls = (
    <View style={s.formHeaderControls}>
      <TouchableOpacity
        onPress={toggleCamera}
        style={s.formHeaderControl}
        accessibilityLabel={cameraEnabled ? "Turn camera off" : "Turn camera on"}
        testID="form-header-camera"
      >
        {cameraEnabled ? (
          <Video size={16} color="#FFFFFF" strokeWidth={2.2} />
        ) : (
          <VideoOff size={16} color="#FFFFFF" strokeWidth={2.2} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={toggleMicrophone}
        style={s.formHeaderControl}
        accessibilityLabel={
          microphoneEnabled ? "Mute microphone" : "Unmute microphone"
        }
        testID="form-header-microphone"
      >
        {microphoneEnabled ? (
          <Mic size={16} color="#FFFFFF" strokeWidth={2.2} />
        ) : (
          <MicOff size={16} color="#FFFFFF" strokeWidth={2.2} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={switchCamera}
        style={s.formHeaderControl}
        accessibilityLabel={`Using ${cameraFacing} camera. Switch camera`}
        testID="form-header-switch-camera"
      >
        <SwitchCamera size={16} color="#FFFFFF" strokeWidth={2.2} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={shareMeetingLink}
        disabled={!roomId}
        style={s.formHeaderControl}
        accessibilityLabel="Share call link"
        testID="form-header-share"
      >
        <Share2 size={16} color="#FFFFFF" strokeWidth={2.2} />
      </TouchableOpacity>
    </View>
  );

  async function sendEmailInvite() {
    if (!inviteEmail.trim() || !shareUrl) return;
    setInviteSending(true);
    setInviteError(null);
    try {
      await api.post("/api/video/invite", {
        to: inviteEmail.trim(),
        roomUrl: shareUrl,
        roomName: roomName ?? "Video Call",
        senderName: userName,
        roomId,
      });
      setInviteSent(true);
      setTimeout(() => {
        setShowEmailModal(false);
        setInviteSheetOpen(false);
        setInviteSent(false);
        setInviteEmail("");
      }, 2000);
    } catch (err: any) {
      setInviteError(err?.message ?? "Could not send invite. Try again.");
    } finally {
      setInviteSending(false);
    }
  }

  // ── PERMISSION DENIED ──
  if (permissionDenied) {
    return (
      <View style={[s.screen, { paddingHorizontal: 32 }]}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 12 }}>
          Camera & Mic Access Required
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", marginBottom: 32, lineHeight: 22 }}>
          Please allow camera and microphone access in your device Settings to join video calls.
        </Text>
        <TouchableOpacity onPress={() => Linking.openSettings()} style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 16 }}>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack}>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── ERROR ──
  if (phase === "error") {
    return (
      <View style={s.screen}>
        <StatusBar barStyle="light-content" />
        <Image source={alenioLogo} style={s.loadingLogo} resizeMode="contain" />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity onPress={goBack} style={s.joinBtn}>
          <Text style={s.joinBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── CONNECTING (provider handoff splash) ──
  if (phase === "connecting") {
    return (
      <View style={s.screen}>
        <StatusBar barStyle="light-content" />
        <Image source={alenioLogo} style={s.loadingLogo} resizeMode="contain" />
        <Text style={s.connectingTitle}>Let&apos;s connect</Text>
        <ActivityIndicator color="#4361EE" size="large" />
        <Text style={s.loadingText}>Setting up your video room...</Text>
      </View>
    );
  }

  // ── PRE-JOIN ──
  if (phase === "prejoin") {
    return (
      <View style={[s.screen, { alignItems: "stretch" }]}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={goBack} style={s.headerBack} testID="back-button">
              <ChevronLeft size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.headerTitle} numberOfLines={1}>{roomName ?? "Video Call"}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Video preview area */}
          <View style={s.previewArea}>
            <UserAvatar
              user={{ name: userName, email: userEmail, image: userImage }}
              size={112}
              radius={56}
              backgroundColor="#4361EE"
              textColor="#FFFFFF"
              fontSize={32}
              style={s.avatarLg}
            />
            <Text style={s.previewName}>{userName}</Text>
          </View>

          {/* Actions */}
          <View style={s.joinRow}>
            <Animated.View style={joinBtnAnimStyle}>
              <TouchableOpacity
                testID="join-call-button"
                style={[s.joinBtn, !roomReady && { opacity: 0.7 }]}
                onPress={requestPermissionsAndJoin}
                disabled={!roomReady}
              >
                <Video size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.joinBtnText}>{roomReady ? "Join call" : "Preparing call..."}</Text>
              </TouchableOpacity>
            </Animated.View>

            {!!shareUrl && (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={[s.secondaryBtn, { flex: 1 }]}
                  onPress={shareMeetingLink}
                >
                  <Share2 size={15} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
                  <Text style={s.secondaryBtnText}>Share link</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.secondaryBtn, { flex: 1 }]}
                  onPress={() => { setShowEmailModal(true); setInviteSent(false); setInviteError(null); }}
                  testID="email-invite-button"
                >
                  <Mail size={15} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
                  <Text style={s.secondaryBtnText}>Email invite</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!shareUrl && (
              <View style={s.screenShareHint}>
                <Monitor size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: 6 }} />
                <Text style={s.screenShareHintText}>
                  Need to share your screen? Join from a computer using the link above
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Email invite modal */}
        <Modal visible={showEmailModal} transparent animationType="slide" onRequestClose={() => setShowEmailModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowEmailModal(false)}>
              <TouchableOpacity activeOpacity={1} style={[s.modalCard, { paddingBottom: insets.bottom + 24 }]}>
                {/* Modal header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Email Invite</Text>
                    <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>Send a professional invite with a join link</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowEmailModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Preview badge */}
                <View style={s.invitePreview}>
                  <View style={s.invitePreviewLogo}>
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Alenio</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
                      {userName} invited you to a video call
                    </Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }} numberOfLines={1}>
                      {roomName ?? "Video Call"} · Tap to join
                    </Text>
                  </View>
                </View>

                {/* Email input */}
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>Recipient email</Text>
                <TextInput
                  style={s.emailInput}
                  placeholder="name@company.com"
                  placeholderTextColor="#CBD5E1"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="invite-email-input"
                />

                {inviteError ? (
                  <Text style={{ fontSize: 13, color: "#EF4444", marginBottom: 12 }}>{inviteError}</Text>
                ) : null}

                <TouchableOpacity
                  style={[s.sendBtn, (!inviteEmail.trim() || inviteSending) && { opacity: 0.5 }]}
                  onPress={sendEmailInvite}
                  disabled={!inviteEmail.trim() || inviteSending}
                  testID="send-invite-button"
                >
                  {inviteSent ? (
                    <>
                      <Check size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={s.sendBtnText}>Invite sent!</Text>
                    </>
                  ) : inviteSending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Mail size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={s.sendBtnText}>Send invite</Text>
                    </>
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  const renderFilmstrip = (people: DailyParticipant[]) => (
    <ScrollView
      horizontal
      style={s.filmstrip}
      contentContainerStyle={s.filmstripContent}
      showsHorizontalScrollIndicator={false}
    >
      {people.map((participant) => (
        <View key={participant.session_id} style={s.filmstripTile}>
          <RemoteParticipantTile
            participant={participant}
            index={0}
            count={1}
            containVideo={false}
            active={participant.session_id === activeSpeakerId}
            pinned={participant.session_id === pinnedParticipantId}
            handRaised={
              raisedHands[participant.session_id] ||
              participantHasRaisedHand(participant)
            }
            onPress={() => setPinnedParticipantId(participant.session_id)}
          />
        </View>
      ))}
    </ScrollView>
  );

  // ── IN-CALL ──
  return (
    <View style={s.nativeCallScreen} testID="native-daily-call">
      <StatusBar barStyle="light-content" />
      {remoteParticipants.length > 0 ? (
        <View
          style={[
            s.remoteGrid,
            checkInFormActive
              ? [s.formVideoRegion, { top: insets.top + 60 }]
              : { bottom: 71 + Math.max(insets.bottom, 14) },
          ]}
          testID="remote-participant-grid"
        >
          {screenShare ? (
            <View style={s.stageLayout}>
              <View style={s.stageMain}>
                <ScreenShareStage
                  videoTrack={screenShare.video}
                  audioTrack={screenShare.audio}
                  sharerName={
                    screenShare.participant.user_name?.trim() || "Someone"
                  }
                />
              </View>
              {!checkInFormActive ? renderFilmstrip(remoteParticipants) : null}
            </View>
          ) : featuredParticipant && !checkInFormActive ? (
            <View style={s.stageLayout}>
              <View style={s.stageMain}>
                <RemoteParticipantTile
                  participant={featuredParticipant}
                  index={0}
                  count={1}
                  containVideo={false}
                  active={featuredParticipant.session_id === activeSpeakerId}
                  pinned={
                    featuredParticipant.session_id === pinnedParticipantId
                  }
                  handRaised={
                    raisedHands[featuredParticipant.session_id] ||
                    participantHasRaisedHand(featuredParticipant)
                  }
                  onPress={() =>
                    setPinnedParticipantId((current) =>
                      current === featuredParticipant.session_id
                        ? null
                        : featuredParticipant.session_id,
                    )
                  }
                />
              </View>
              {renderFilmstrip(filmstripParticipants)}
            </View>
          ) : (
            remoteParticipants.map((participant, index) => (
              <RemoteParticipantTile
                key={participant.session_id}
                participant={participant}
                index={index}
                count={remoteParticipants.length}
                containVideo={checkInFormActive}
                active={participant.session_id === activeSpeakerId}
                pinned={participant.session_id === pinnedParticipantId}
                handRaised={
                  raisedHands[participant.session_id] ||
                  participantHasRaisedHand(participant)
                }
                onPress={() =>
                  setPinnedParticipantId((current) =>
                    current === participant.session_id
                      ? null
                      : participant.session_id,
                  )
                }
              />
            ))
          )}
        </View>
      ) : (
        <View
          style={[
            s.waitingState,
            checkInFormActive
              ? [s.formVideoRegion, { top: insets.top + 60 }]
              : null,
          ]}
          testID="waiting-for-participant-state"
        >
          <View style={s.waitingAvatar}>
            <Text style={s.waitingInitial}>
              {(roomName?.trim()[0] || "A").toUpperCase()}
            </Text>
          </View>
          <Text style={s.waitingTitle}>Waiting for the other person…</Text>
          <Text style={s.waitingSubtitle}>
            Share the room link if they have not joined yet.
          </Text>
        </View>
      )}

      <View style={[s.callHeader, { paddingTop: insets.top + 10 }]}>
        {checkInFormActive ? (
          <View style={{ width: 4 }} />
        ) : (
          <TouchableOpacity
            onPress={() => void leaveCall()}
            style={s.callHeaderBack}
            accessibilityLabel="Leave call and go back"
          >
            <ChevronLeft size={21} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        )}
        <Pressable
          style={s.callHeaderCopy}
          onPress={() => setParticipantsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`View ${participantList.length || 1} participants`}
        >
          <Text style={s.callHeaderTitle} numberOfLines={1}>
            {roomName ?? "Video Call"}
          </Text>
          <View style={s.liveRow}>
            <View style={s.liveDot} />
            <Text style={s.liveLabel}>
              LIVE · {participantList.length || 1}{" "}
              {(participantList.length || 1) === 1 ? "person" : "people"}
            </Text>
          </View>
        </Pressable>
        {checkInFormActive ? (
          <View style={{ width: 154 }} />
        ) : (
          <TouchableOpacity
            onPress={() => setMoreMenuOpen(true)}
            style={s.callHeaderAction}
            accessibilityLabel="More meeting options"
            testID="meeting-more-button"
          >
            <MoreHorizontal size={19} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        )}
      </View>

      {localVideoTrack ? (
        <RNAnimated.View
          {...previewPanResponder.panHandlers}
          style={[
            s.localPreview,
            { transform: previewPosition.getTranslateTransform() },
          ]}
          accessibilityLabel="Your draggable camera preview"
        >
          <DailyMediaView
            videoTrack={localVideoTrack}
            audioTrack={null}
            mirror
            objectFit="cover"
            style={s.localVideo}
          />
          <View style={s.localPreviewLabel}>
            <Text style={s.localPreviewLabelText}>You</Text>
          </View>
        </RNAnimated.View>
      ) : null}

      {reactionBubbles.length > 0 ? (
        <View
          style={[s.reactionStack, { top: insets.top + 76 }]}
          pointerEvents="none"
        >
          {reactionBubbles.map((bubble) => (
            <View key={bubble.id} style={s.reactionBubble}>
              <Text style={s.reactionEmoji}>{bubble.reaction}</Text>
              <Text style={s.reactionSender} numberOfLines={1}>
                {bubble.senderName}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {transcription.status === "active" && !checkInFormActive ? (
        <View style={[s.liveNotesNotice, { top: insets.top + 75 }]}>
          <Sparkles size={13} color="#FFFFFF" />
          <Text style={s.liveNotesNoticeText}>
            Seneca is taking notes on this call
          </Text>
        </View>
      ) : null}

      {reconnecting ? (
        <View style={[s.connectionNotice, { top: insets.top + 75 }]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={s.connectionNoticeText}>Reconnecting…</Text>
        </View>
      ) : networkQuality === "bad" ? (
        <View style={[s.connectionNotice, { top: insets.top + 75 }]}>
          <Text style={s.connectionNoticeText}>Connection is unstable</Text>
        </View>
      ) : null}

      {reactionPickerOpen && !checkInFormActive ? (
        <View
          style={[
            s.reactionPicker,
            { bottom: 88 + Math.max(insets.bottom, 14) },
          ]}
        >
          {MEETING_REACTIONS.map((reaction) => (
            <Pressable
              key={reaction}
              onPress={() => sendReaction(reaction)}
              style={s.reactionPickerButton}
              accessibilityLabel={`React ${reaction}`}
            >
              <Text style={s.reactionPickerEmoji}>{reaction}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!checkInFormActive ? (
        <View style={[s.callControls, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={toggleCamera}
          style={s.callControl}
          accessibilityLabel={cameraEnabled ? "Turn camera off" : "Turn camera on"}
        >
          {cameraEnabled ? (
            <Video size={20} color="#FFFFFF" strokeWidth={2.2} />
          ) : (
            <VideoOff size={20} color="#FFFFFF" strokeWidth={2.2} />
          )}
          <Text style={s.callControlLabel}>
            {cameraEnabled ? "Camera" : "Camera off"}
          </Text>
        </Pressable>
        <Pressable
          onPress={toggleMicrophone}
          style={s.callControl}
          accessibilityLabel={
            microphoneEnabled ? "Mute microphone" : "Unmute microphone"
          }
        >
          {microphoneEnabled ? (
            <Mic size={20} color="#FFFFFF" strokeWidth={2.2} />
          ) : (
            <MicOff size={20} color="#FFFFFF" strokeWidth={2.2} />
          )}
          <Text style={s.callControlLabel}>
            {microphoneEnabled ? "Mute" : "Unmute"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setReactionPickerOpen((open) => !open)}
          style={s.callControl}
          accessibilityLabel="Open meeting reactions"
        >
          <Smile size={19} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={s.callControlLabel}>React</Text>
        </Pressable>
        <Pressable
          onPress={toggleRaisedHand}
          style={[s.callControl, localHandRaised ? s.callControlSelected : null]}
          accessibilityLabel={localHandRaised ? "Lower hand" : "Raise hand"}
        >
          <Hand size={19} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={s.callControlLabel}>
            {localHandRaised ? "Lower" : "Raise"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMoreMenuOpen(true)}
          style={s.callControl}
          accessibilityLabel="More meeting options"
        >
          <MoreHorizontal size={20} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={s.callControlLabel}>More</Text>
        </Pressable>
        <Pressable
          testID="leave-call-button"
          onPress={() => void leaveCall()}
          style={[s.callControl, s.endCallControl]}
          accessibilityLabel="Leave video call"
        >
          <PhoneOff size={20} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={s.callControlLabel}>Leave</Text>
        </Pressable>
        </View>
      ) : null}

      <AlenioBottomSheet
        visible={participantsOpen}
        title="Participants"
        subtitle={`${participantList.length || 1} in this meeting`}
        onClose={() => setParticipantsOpen(false)}
        compact
        showCloseButton
        showScrollIndicator
        bodyHeightRatio={0.55}
      >
        <View style={s.participantList}>
          {participantList.map((participant) => {
            const displayName =
              participant.user_name?.trim() ||
              (participant.local ? userName : "Participant");
            const audioOn = participant.tracks.audio.state === "playable";
            const handRaised =
              participant.local
                ? localHandRaised
                : raisedHands[participant.session_id] ||
                  participantHasRaisedHand(participant);
            return (
              <Pressable
                key={participant.session_id}
                onPress={() => {
                  if (participant.local) return;
                  setPinnedParticipantId((current) =>
                    current === participant.session_id
                      ? null
                      : participant.session_id,
                  );
                  setParticipantsOpen(false);
                }}
                style={[
                  s.participantRow,
                  participant.session_id === activeSpeakerId
                    ? s.participantRowActive
                    : null,
                ]}
              >
                <View style={s.participantAvatar}>
                  <Text style={s.participantAvatarText}>
                    {(displayName[0] || "A").toUpperCase()}
                  </Text>
                </View>
                <View style={s.participantCopy}>
                  <View style={s.participantNameRow}>
                    <Text style={s.participantName} numberOfLines={1}>
                      {displayName}
                      {participant.local ? " (You)" : ""}
                    </Text>
                    {participant.owner ? (
                      <Text style={s.hostBadge}>HOST</Text>
                    ) : null}
                    {handRaised ? (
                      <Text style={s.participantHand}>✋</Text>
                    ) : null}
                  </View>
                  <Text style={s.participantStatus}>
                    {audioOn ? "Microphone on" : "Muted"}
                    {participant.session_id === pinnedParticipantId
                      ? " · Pinned"
                      : ""}
                  </Text>
                </View>
                {audioOn ? (
                  <Mic size={16} color="#4361EE" />
                ) : (
                  <MicOff size={16} color="#94A3B8" />
                )}
                {isMeetingHost && !participant.local ? (
                  <View style={s.participantHostActions}>
                    {audioOn ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          muteRemoteParticipant(participant);
                        }}
                        style={s.participantAction}
                        accessibilityLabel={`Mute ${displayName}`}
                      >
                        <VolumeX size={15} color="#475569" />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        removeRemoteParticipant(participant);
                      }}
                      style={[s.participantAction, s.participantRemoveAction]}
                      accessibilityLabel={`Remove ${displayName}`}
                    >
                      <UserMinus size={15} color="#BE123C" />
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={moreMenuOpen}
        title="More"
        subtitle="Meeting options"
        onClose={() => setMoreMenuOpen(false)}
        compact
        showCloseButton
        scrollEnabled={false}
      >
        <View style={s.moreMenu}>
          <Pressable
            onPress={() => {
              switchCamera();
              setMoreMenuOpen(false);
            }}
            style={s.moreMenuRow}
          >
            <View style={s.moreMenuIcon}>
              <SwitchCamera size={17} color="#4361EE" />
            </View>
            <View style={s.moreMenuCopy}>
              <Text style={s.moreMenuTitle}>Switch camera</Text>
              <Text style={s.moreMenuSubtitle}>
                Currently using the {cameraFacing} camera
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              setMoreMenuOpen(false);
              setInviteSent(false);
              setInviteError(null);
              setTimeout(() => setInviteSheetOpen(true), 180);
            }}
            style={s.moreMenuRow}
          >
            <View style={s.moreMenuIcon}>
              <Share2 size={17} color="#4361EE" />
            </View>
            <View style={s.moreMenuCopy}>
              <Text style={s.moreMenuTitle}>Invite people</Text>
              <Text style={s.moreMenuSubtitle}>Share the meeting link</Text>
            </View>
          </Pressable>
          {checkInToolsAvailable && isMeetingHost ? (
            <Pressable
              onPress={() => {
                setMoreMenuOpen(false);
                if (transcriptionActive) {
                  void transcription.stop();
                  return;
                }
                setTimeout(() => setLiveNotesConsentOpen(true), 180);
              }}
              style={s.moreMenuRow}
              testID="live-notes-button"
            >
              <View style={s.moreMenuIcon}>
                <Sparkles size={17} color="#4361EE" />
              </View>
              <View style={s.moreMenuCopy}>
                <Text style={s.moreMenuTitle}>
                  {transcriptionActive ? "Stop live notes" : "Live notes"}
                </Text>
                <Text style={s.moreMenuSubtitle}>
                  {transcriptionActive
                    ? "Stop transcribing this conversation"
                    : "Let Seneca write up the check-in for you"}
                </Text>
              </View>
            </Pressable>
          ) : null}
          {checkInToolsAvailable ? (
            <Pressable
              onPress={() => {
                setMoreMenuOpen(false);
                setTimeout(() => setMeetingToolsOpen(true), 180);
              }}
              style={s.moreMenuRow}
              testID="meeting-tools-button"
            >
              <View style={s.moreMenuIcon}>
                <SlidersHorizontal size={17} color="#4361EE" />
              </View>
              <View style={s.moreMenuCopy}>
                <Text style={s.moreMenuTitle}>Check-in tools</Text>
                <Text style={s.moreMenuSubtitle}>
                  Open a check-in form for a participant
                </Text>
              </View>
            </Pressable>
          ) : null}
          {isMeetingHost ? (
            <Pressable
              onPress={() => {
                setMoreMenuOpen(false);
                setTimeout(endMeetingForEveryone, 180);
              }}
              style={[s.moreMenuRow, s.moreMenuDangerRow]}
            >
              <View style={[s.moreMenuIcon, s.moreMenuDangerIcon]}>
                <PhoneOff size={17} color="#BE123C" />
              </View>
              <View style={s.moreMenuCopy}>
                <Text style={[s.moreMenuTitle, { color: "#BE123C" }]}>
                  End for everyone
                </Text>
                <Text style={s.moreMenuSubtitle}>
                  Disconnect everyone from this meeting
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={inviteSheetOpen}
        title="Invite people"
        subtitle="Bring someone into this meeting"
        onClose={() => {
          setInviteSheetOpen(false);
          setInviteError(null);
        }}
        compact
        showCloseButton
        scrollEnabled={false}
      >
        <View style={s.inviteSheet}>
          <Pressable
            onPress={shareMeetingLink}
            style={s.inviteShareButton}
            accessibilityRole="button"
            accessibilityLabel="Share meeting link"
          >
            <View style={s.moreMenuIcon}>
              <Share2 size={17} color="#4361EE" />
            </View>
            <View style={s.moreMenuCopy}>
              <Text style={s.moreMenuTitle}>Share meeting link</Text>
              <Text style={s.moreMenuSubtitle}>
                Send through Messages, Mail, or another app
              </Text>
            </View>
          </Pressable>

          <View style={s.inviteDividerRow}>
            <View style={s.inviteDivider} />
            <Text style={s.inviteDividerText}>OR EMAIL AN INVITE</Text>
            <View style={s.inviteDivider} />
          </View>

          <TextInput
            style={s.emailInput}
            placeholder="name@company.com"
            placeholderTextColor="#CBD5E1"
            value={inviteEmail}
            onChangeText={(value) => {
              setInviteEmail(value);
              setInviteError(null);
              setInviteSent(false);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="in-call-invite-email"
          />
          {inviteError ? (
            <Text style={s.inviteError}>{inviteError}</Text>
          ) : null}
          <TouchableOpacity
            style={[
              s.sendBtn,
              (!inviteEmail.trim() || inviteSending) && { opacity: 0.5 },
            ]}
            onPress={() => void sendEmailInvite()}
            disabled={!inviteEmail.trim() || inviteSending}
            testID="in-call-send-invite"
          >
            {inviteSent ? (
              <>
                <Check size={18} color="#FFFFFF" />
                <Text style={s.sendBtnText}>Invite sent</Text>
              </>
            ) : inviteSending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Mail size={18} color="#FFFFFF" />
                <Text style={s.sendBtnText}>Send email invite</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={liveNotesConsentOpen}
        title="Live notes"
        subtitle="Seneca writes up the check-in from your conversation"
        onClose={() => setLiveNotesConsentOpen(false)}
        compact
        showCloseButton
        scrollEnabled={false}
      >
        <View style={s.liveNotesSheet}>
          <Text style={s.liveNotesBody}>
            This call will be transcribed while you talk. Everyone on the call
            is told it is on. Say it out loud too, and stop if anyone would
            rather you did not.
          </Text>
          <Text style={s.liveNotesBody}>
            No recording is kept. When you finish, Seneca fills in the check-in
            and you review every answer before it is published.
          </Text>
          <TouchableOpacity
            style={s.sendBtn}
            onPress={() => {
              setLiveNotesConsentOpen(false);
              void transcription.start();
            }}
            accessibilityRole="button"
            testID="live-notes-start"
          >
            <Sparkles size={18} color="#FFFFFF" />
            <Text style={s.sendBtnText}>They agreed, start notes</Text>
          </TouchableOpacity>
        </View>
      </AlenioBottomSheet>

      {roomId ? (
        <MeetingCheckInTool
          roomId={roomId}
          visible={meetingToolsOpen}
          activeParticipantUserIds={activeParticipantUserIds}
          leaderUserId={session?.user?.id ?? null}
          leaderName={userName}
          onClose={() => setMeetingToolsOpen(false)}
          onFormActiveChange={setCheckInFormActive}
          formHeaderControls={meetingFormHeaderControls}
          onDraftSaveReady={handleDraftSaveReady}
          callTranscript={transcription.usable ? transcription.transcript : null}
          callTranscriptActive={transcription.status === "active"}
          onStopCallTranscript={() => void transcription.stop()}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: "#0A0F1E",
    alignItems: "center", justifyContent: "center",
  },
  loadingLogo: { width: 180, height: 54, marginBottom: 28 },
  connectingTitle: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 18 },
  loadingText: { color: "rgba(255,255,255,0.5)", marginTop: 14, fontSize: 14 },
  errorText: { color: "#fff", fontSize: 16, textAlign: "center", paddingHorizontal: 32, marginBottom: 24 },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerBack: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, color: "#fff", fontSize: 17,
    fontWeight: "600", textAlign: "center",
  },

  previewArea: {
    flex: 1, margin: 16, borderRadius: 24,
    backgroundColor: "#111827",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  avatarLg: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: "#4361EE",
  },
  avatarInitials: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "#4361EE",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitialsText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  previewName: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 14 },

  joinRow: { paddingHorizontal: 24, paddingBottom: 24 },
  joinBtn: {
    backgroundColor: "#4361EE",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 18, borderRadius: 18,
    shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16,
  },
  joinBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },

  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },

  nativeCallScreen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#07101F",
  },
  remoteGrid: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#000000",
  },
  remoteTile: {
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07101F",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  remoteTileActive: {
    borderWidth: 2,
    borderColor: "#5B7CFF",
  },
  remoteTileVideo: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000000",
  },
  remoteTileAudio: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  remoteTileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#273650",
  },
  remoteTileInitial: {
    fontSize: 25,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  remoteTileName: {
    marginTop: 11,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  remoteTileStatus: {
    marginTop: 3,
    fontSize: 10,
    color: "rgba(255,255,255,0.56)",
  },
  remoteTileNameBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: "80%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(3,8,18,0.7)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  remoteTileHand: {
    fontSize: 11,
  },
  remoteTileNameBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  remoteTileRaisedHand: {
    position: "absolute",
    bottom: 12,
    right: 9,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(67,97,238,0.9)",
  },
  remoteTileRaisedHandText: {
    fontSize: 16,
  },
  stageLayout: {
    flex: 1,
    backgroundColor: "#000000",
  },
  screenShareStage: {
    flex: 1,
    backgroundColor: "#000000",
  },
  screenShareBadge: {
    position: "absolute",
    left: 8,
    top: 8,
    maxWidth: "80%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(3,8,18,0.7)",
  },
  screenShareBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  stageMain: {
    flex: 1,
    minHeight: 0,
  },
  filmstrip: {
    flexGrow: 0,
    height: 104,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(3,8,18,0.94)",
  },
  filmstripContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  filmstripTile: {
    width: 94,
    height: 88,
    overflow: "hidden",
    borderRadius: 12,
  },
  formVideoRegion: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: "64%",
    left: 0,
    backgroundColor: "#000000",
  },
  waitingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  waitingAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#273650",
  },
  waitingInitial: {
    fontSize: 29,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  waitingTitle: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  waitingSubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: "rgba(255,255,255,0.56)",
  },
  callHeader: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(3,8,18,0.42)",
  },
  callHeaderBack: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  callHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  callHeaderTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  liveRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  liveLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.7)",
  },
  callHeaderAction: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  formHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  formHeaderControl: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  localPreview: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 100,
    height: 136,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "#111827",
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    zIndex: 24,
  },
  localVideo: {
    flex: 1,
  },
  localPreviewLabel: {
    position: "absolute",
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(3,8,18,0.7)",
  },
  localPreviewLabelText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  callControls: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    paddingTop: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(3,8,18,0.72)",
  },
  callControl: {
    flex: 1,
    minHeight: 58,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(30,41,59,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  callControlSelected: {
    backgroundColor: "#4361EE",
    borderColor: "#6F86F7",
  },
  endCallControl: {
    backgroundColor: "#E11D48",
    borderColor: "#E11D48",
  },
  callControlLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  reactionStack: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: "center",
    gap: 6,
  },
  reactionBubble: {
    maxWidth: 220,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(3,8,18,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  reactionEmoji: {
    fontSize: 21,
  },
  reactionSender: {
    maxWidth: 150,
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  reactionPicker: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 45,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 20,
    flexDirection: "row",
    gap: 3,
    backgroundColor: "rgba(3,8,18,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  reactionPickerButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  reactionPickerEmoji: {
    fontSize: 23,
  },
  connectionNotice: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 42,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(180,83,9,0.92)",
  },
  connectionNoticeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  liveNotesNotice: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 42,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(67,97,238,0.92)",
  },
  liveNotesNoticeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  liveNotesSheet: { gap: 14, paddingBottom: 4 },
  liveNotesBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  participantList: {
    gap: 8,
  },
  participantRow: {
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#E8ECF3",
    backgroundColor: "#FFFFFF",
  },
  participantRowActive: {
    borderColor: "#AFC0FF",
    backgroundColor: "#F5F7FF",
  },
  participantAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#273650",
  },
  participantAvatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  participantCopy: {
    flex: 1,
    minWidth: 0,
  },
  participantNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  participantName: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#172033",
  },
  hostBadge: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#4361EE",
  },
  participantHand: {
    fontSize: 13,
  },
  participantStatus: {
    marginTop: 3,
    fontSize: 10,
    color: "#7A8699",
  },
  participantHostActions: {
    flexDirection: "row",
    gap: 5,
  },
  participantAction: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  participantRemoveAction: {
    backgroundColor: "#FFF1F2",
  },
  moreMenu: {
    gap: 8,
  },
  moreMenuRow: {
    minHeight: 62,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#E8ECF3",
    backgroundColor: "#FFFFFF",
  },
  moreMenuDangerRow: {
    borderColor: "#F6D8DD",
    backgroundColor: "#FFF9FA",
  },
  moreMenuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  moreMenuDangerIcon: {
    backgroundColor: "#FFF1F2",
  },
  moreMenuCopy: {
    flex: 1,
    minWidth: 0,
  },
  moreMenuTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#172033",
  },
  moreMenuSubtitle: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#7A8699",
  },
  inviteSheet: {
    gap: 12,
  },
  inviteShareButton: {
    minHeight: 64,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#DCE3F4",
    backgroundColor: "#F8FAFF",
  },
  inviteDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 2,
  },
  inviteDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#DCE2EC",
  },
  inviteDividerText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.65,
    color: "#94A3B8",
  },
  inviteError: {
    marginTop: -8,
    fontSize: 11,
    color: "#DC2626",
  },

  screenShareHint: {
    marginTop: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 12,
  },
  screenShareHintText: {
    color: "rgba(255,255,255,0.4)", fontSize: 12,
    textAlign: "center", lineHeight: 18,
  },

  // Email modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24,
  },
  invitePreview: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#F8FAFC", borderRadius: 12,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  invitePreviewLogo: {
    backgroundColor: "#4361EE", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  emailInput: {
    borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: "#0F172A", marginBottom: 16,
    backgroundColor: "#F8FAFC",
  },
  sendBtn: {
    backgroundColor: "#4361EE", borderRadius: 14,
    paddingVertical: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
