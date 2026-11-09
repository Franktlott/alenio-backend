import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
} from "lucide-react-native";
import {
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import Daily, {
  DailyMediaView,
  type DailyCall,
} from "@daily-co/react-native-daily-js";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";

type CallPhase = "prejoin" | "joining" | "incall" | "error";
type DailyParticipants = ReturnType<DailyCall["participants"]>;
type DailyParticipant = DailyParticipants[string];

type Props = {
  roomId: string;
  roomName: string;
  presentation?: "inline" | "background";
  showLeaveControl?: boolean;
  onCallActiveChange?: (active: boolean) => void;
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
 * sharing cannot hold a frozen frame on screen.
 */
function participantScreenTracks(participant: DailyParticipant | undefined) {
  const video = participant?.tracks?.screenVideo;
  const audio = participant?.tracks?.screenAudio;
  return {
    video: video?.state === "playable" ? (video.persistentTrack ?? null) : null,
    audio: audio?.state === "playable" ? (audio.persistentTrack ?? null) : null,
  };
}

export function EmbeddedVideoCallView({
  roomId,
  roomName,
  presentation = "inline",
  showLeaveControl = true,
  onCallActiveChange,
}: Props) {
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const callRef = useRef<DailyCall | null>(null);
  const [phase, setPhase] = useState<CallPhase>("prejoin");
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [participants, setParticipants] =
    useState<DailyParticipants | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const userName = authReady?.me?.name ?? session?.user?.name ?? "Guest";
  const isBackground = presentation === "background";

  useEffect(() => {
    onCallActiveChange?.(phase === "joining" || phase === "incall");
  }, [onCallActiveChange, phase]);

  useEffect(
    () => () => {
      onCallActiveChange?.(false);
    },
    [onCallActiveChange],
  );

  const refreshParticipants = useCallback(() => {
    const call = callRef.current;
    if (call) setParticipants({ ...call.participants() });
  }, []);

  useEffect(() => {
    const call = Daily.createCallObject({
      allowMultipleCallInstances: true,
      reactNativeConfig: {
        androidInCallNotification: {
          title: roomName || "Alenio video call",
          subtitle: "Video check-in in progress",
        },
      },
    });
    callRef.current = call;
    const participantEvents = [
      "participant-joined",
      "participant-updated",
      "participant-left",
    ] as const;
    participantEvents.forEach((event) =>
      call.on(event, refreshParticipants),
    );
    call.on("joined-meeting", refreshParticipants);
    call.on("left-meeting", refreshParticipants);
    call.on("error", (event) => {
      setError(event?.errorMsg ?? "The video call encountered an error.");
      setPhase("error");
    });
    return () => {
      participantEvents.forEach((event) =>
        call.off(event, refreshParticipants),
      );
      call.off("joined-meeting", refreshParticipants);
      call.off("left-meeting", refreshParticipants);
      void call.destroy();
      callRef.current = null;
    };
  }, [refreshParticipants, roomName]);

  const fetchRoom = useCallback(async () => {
    setRoomLoading(true);
    setError(null);
    try {
      const data = await api.post<{ url: string; token: string }>(
        "/api/video/room",
        { roomId, userName },
      );
      if (!data?.url || !data?.token) {
        throw new Error("Could not prepare the video room.");
      }
      setRoomUrl(data.url);
      setRoomToken(data.token);
    } catch (roomError) {
      setError(
        roomError instanceof Error
          ? roomError.message
          : "Could not prepare the video room.",
      );
      setPhase("error");
    } finally {
      setRoomLoading(false);
    }
  }, [roomId, userName]);

  useEffect(() => {
    setPhase("prejoin");
    setRoomUrl(null);
    setRoomToken(null);
    setPermissionDenied(false);
    setParticipants(null);
    setCameraEnabled(false);
    setMicrophoneEnabled(false);
    void fetchRoom();
  }, [fetchRoom]);

  const participantList = useMemo(
    () => (participants ? Object.values(participants) : []),
    [participants],
  );
  const localParticipant = participantList.find(
    (participant) => participant.local,
  );
  const remoteParticipant = participantList.find(
    (participant) => !participant.local,
  );
  const remoteScreen = participantScreenTracks(remoteParticipant);
  // A shared screen replaces their camera here: this view only has room for
  // one feed, and the screen is the thing being pointed at.
  const remoteVideoTrack =
    remoteScreen.video ?? participantVideoTrack(remoteParticipant);
  const remoteAudioTrack = participantAudioTrack(remoteParticipant);
  const localVideoTrack = participantVideoTrack(localParticipant);

  const join = async () => {
    const call = callRef.current;
    if (!call || !roomUrl || !roomToken || roomLoading) return;
    setPhase("joining");
    setError(null);
    const camera = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!camera?.granted) {
      setPermissionDenied(true);
      setPhase("prejoin");
      return;
    }
    const microphone = micPermission?.granted
      ? micPermission
      : await requestMicPermission();
    if (!microphone?.granted) {
      setPermissionDenied(true);
      setPhase("prejoin");
      return;
    }
    try {
      await call.join({
        url: roomUrl,
        token: roomToken,
        userName,
      });
      call.setLocalVideo(false);
      call.setLocalAudio(false);
      setPermissionDenied(false);
      setPhase("incall");
      refreshParticipants();
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Could not join the video call.",
      );
      setPhase("error");
    }
  };

  const leave = async () => {
    try {
      await callRef.current?.leave();
    } finally {
      setParticipants(null);
      setCameraEnabled(false);
      setMicrophoneEnabled(false);
      setPhase("prejoin");
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

  if (phase === "incall") {
    return (
      <View
        style={[
          styles.callShell,
          isBackground && styles.callBackground,
        ]}
        testID="embedded-native-video-call"
      >
        {remoteVideoTrack ? (
          <DailyMediaView
            videoTrack={remoteVideoTrack}
            audioTrack={remoteAudioTrack}
            // A cropped screen share loses the edges of what is being shown.
            objectFit={remoteScreen.video ? "contain" : "cover"}
            style={styles.remoteVideo}
          />
        ) : (
          <View style={styles.waitingState}>
            <View style={styles.waitingAvatar}>
              <Text style={styles.waitingInitial}>
                {(roomName.trim()[0] || "A").toUpperCase()}
              </Text>
            </View>
            <Text style={styles.waitingTitle}>Waiting for the other person…</Text>
            <Text style={styles.waitingSubtitle}>
              You can continue filling out the check-in.
            </Text>
          </View>
        )}

        {/* Sound from a shared tab, kept separate so their voice still plays. */}
        {remoteScreen.audio ? (
          <DailyMediaView
            videoTrack={null}
            audioTrack={remoteScreen.audio}
            style={styles.screenAudioOnly}
          />
        ) : null}

        {localVideoTrack ? (
          <View style={styles.localPreview}>
            <DailyMediaView
              videoTrack={localVideoTrack}
              audioTrack={null}
              mirror
              objectFit="cover"
              style={styles.localVideo}
            />
          </View>
        ) : null}

        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={toggleCamera}
            style={styles.control}
            accessibilityRole="button"
            accessibilityLabel={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            {cameraEnabled ? (
              <Video size={17} color="#FFFFFF" strokeWidth={2.2} />
            ) : (
              <VideoOff size={17} color="#FFFFFF" strokeWidth={2.2} />
            )}
          </Pressable>
          <Pressable
            onPress={toggleMicrophone}
            style={styles.control}
            accessibilityRole="button"
            accessibilityLabel={
              microphoneEnabled ? "Mute microphone" : "Unmute microphone"
            }
          >
            {microphoneEnabled ? (
              <Mic size={17} color="#FFFFFF" strokeWidth={2.2} />
            ) : (
              <MicOff size={17} color="#FFFFFF" strokeWidth={2.2} />
            )}
          </Pressable>
          {showLeaveControl ? (
            <Pressable
              onPress={() => void leave()}
              style={[styles.control, styles.leaveControl]}
              accessibilityRole="button"
              accessibilityLabel="Leave video call"
            >
              <PhoneOff size={17} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.prejoinCard,
        isBackground && styles.prejoinBackground,
      ]}
      testID="embedded-native-video-prejoin"
    >
      <View style={[styles.videoIcon, isBackground && styles.videoIconDark]}>
        <Video size={17} color={isBackground ? "#FFFFFF" : "#5545D9"} strokeWidth={2.2} />
      </View>
      <View style={styles.prejoinCopy}>
        <Text
          style={[styles.prejoinTitle, isBackground && styles.prejoinTitleDark]}
          numberOfLines={1}
        >
          {permissionDenied ? "Camera and microphone blocked" : "Join call"}
        </Text>
        <Text
          style={[
            styles.prejoinSubtitle,
            isBackground && styles.prejoinSubtitleDark,
          ]}
          numberOfLines={2}
        >
          {permissionDenied
            ? "Allow access in Settings to join."
            : error ?? "See each other while completing the check-in."}
        </Text>
      </View>
      {permissionDenied ? (
        <Pressable onPress={() => Linking.openSettings()} style={styles.joinButton}>
          <Settings size={13} color="#FFFFFF" />
          <Text style={styles.joinButtonText}>Settings</Text>
        </Pressable>
      ) : phase === "error" ? (
        <Pressable
          onPress={() => {
            setPhase("prejoin");
            void fetchRoom();
          }}
          style={styles.joinButton}
        >
          <Text style={styles.joinButtonText}>Retry</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void join()}
          disabled={roomLoading || phase === "joining"}
          style={[
            styles.joinButton,
            (roomLoading || phase === "joining") && styles.joinButtonDisabled,
          ]}
        >
          {roomLoading || phase === "joining" ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Video size={13} color="#FFFFFF" />
              <Text style={styles.joinButtonText}>Join</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  prejoinCard: {
    minHeight: 62,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E6F2",
    backgroundColor: "#F8F7FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  prejoinBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: 0,
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 22,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#0A0F1E",
  },
  videoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#ECE9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  videoIconDark: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  prejoinCopy: {
    flex: 1,
    minWidth: 0,
  },
  prejoinTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#20283C",
  },
  prejoinTitleDark: {
    color: "#FFFFFF",
  },
  prejoinSubtitle: {
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 13,
    color: "#778399",
  },
  prejoinSubtitleDark: {
    color: "rgba(255,255,255,0.62)",
  },
  joinButton: {
    minWidth: 62,
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: "#4361EE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  joinButtonDisabled: {
    opacity: 0.62,
  },
  joinButtonText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  callShell: {
    height: 200,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0A0F1E",
    borderWidth: 1,
    borderColor: "#202A3F",
  },
  callBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    height: undefined,
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  remoteVideo: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  screenAudioOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  waitingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  waitingAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#28344A",
    alignItems: "center",
    justifyContent: "center",
  },
  waitingInitial: {
    fontSize: 21,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  waitingTitle: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  waitingSubtitle: {
    marginTop: 3,
    fontSize: 9.5,
    color: "rgba(255,255,255,0.58)",
  },
  localPreview: {
    position: "absolute",
    top: 42,
    right: 10,
    width: 72,
    height: 96,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "#111827",
  },
  localVideo: {
    flex: 1,
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    minHeight: 23,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.78)",
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
  liveText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
    color: "#FFFFFF",
  },
  controls: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    gap: 7,
  },
  control: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(15,23,42,0.82)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  leaveControl: {
    backgroundColor: "#E11D48",
    borderColor: "#E11D48",
  },
});
