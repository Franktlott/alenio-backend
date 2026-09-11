import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react-native";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { OneOnOneHistoryTab } from "@/components/OneOnOneHistoryTab";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";
import {
  activeMeetingCheckInPairs,
  meetingCheckInWorkspacesForMember,
  uniqueMeetingCheckInMembers,
  type MeetingCheckInContext,
  type MeetingCheckInEligiblePair,
} from "@/lib/meeting-check-in-tool";

type Props = {
  roomId: string;
  visible: boolean;
  activeParticipantUserIds: string[];
  leaderUserId: string | null;
  leaderName: string;
  onClose: () => void;
  onFormActiveChange?: (active: boolean) => void;
  formHeaderControls?: ReactNode;
  onDraftSaveReady?: (saveDraft: (() => Promise<void>) | null) => void;
  /** The call's live transcript, once there is enough of it to write up. */
  callTranscript?: string | null;
  callTranscriptActive?: boolean;
  onStopCallTranscript?: () => void;
  onCallTranscriptWrittenUp?: () => void;
};

function memberName(pair: MeetingCheckInEligiblePair): string {
  return pair.member.name?.trim() || pair.member.email.split("@")[0] || "Member";
}

export function MeetingCheckInTool({
  roomId,
  visible,
  activeParticipantUserIds,
  leaderUserId,
  leaderName,
  onClose,
  onFormActiveChange,
  formHeaderControls,
  onDraftSaveReady,
  callTranscript,
  callTranscriptActive,
  onStopCallTranscript,
  onCallTranscriptWrittenUp,
}: Props) {
  const [context, setContext] = useState<MeetingCheckInContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"tools" | "member" | "workspace">("tools");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activePair, setActivePair] =
    useState<MeetingCheckInEligiblePair | null>(null);
  const [launchToken, setLaunchToken] = useState(0);
  const flowStartedRef = useRef(false);

  useEffect(() => {
    if (!visible || context) return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<MeetingCheckInContext>(
        `/api/video/room/${encodeURIComponent(roomId)}/check-in-context`,
      )
      .then((result) => {
        if (active) setContext(result);
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Check-in tools are unavailable for this call.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [context, roomId, visible]);

  useEffect(() => {
    setContext(null);
    setStage("tools");
    setSelectedMemberId(null);
  }, [roomId]);

  const eligiblePairs = useMemo(
    () => activeMeetingCheckInPairs(context, activeParticipantUserIds),
    [activeParticipantUserIds, context],
  );
  const uniqueMembers = useMemo(
    () => uniqueMeetingCheckInMembers(eligiblePairs),
    [eligiblePairs],
  );
  const selectedMemberPairs = useMemo(
    () => meetingCheckInWorkspacesForMember(eligiblePairs, selectedMemberId),
    [eligiblePairs, selectedMemberId],
  );

  const launch = (pair: MeetingCheckInEligiblePair) => {
    flowStartedRef.current = false;
    setActivePair(pair);
    setLaunchToken((token) => token + 1);
    setStage("tools");
    setSelectedMemberId(null);
    onClose();
  };

  const chooseMember = (pair: MeetingCheckInEligiblePair) => {
    const choices = eligiblePairs.filter(
      (candidate) => candidate.member.id === pair.member.id,
    );
    if (choices.length === 1) {
      launch(choices[0]);
      return;
    }
    setSelectedMemberId(pair.member.id);
    setStage("workspace");
  };

  const closeSheet = () => {
    setStage("tools");
    setSelectedMemberId(null);
    onClose();
  };

  const handleFlowActiveChange = useCallback((active: boolean) => {
    if (active) {
      flowStartedRef.current = true;
    } else if (flowStartedRef.current) {
      flowStartedRef.current = false;
      setActivePair(null);
    }
  }, []);

  const title =
    stage === "tools"
      ? "Meeting tools"
      : stage === "member"
        ? "Choose participant"
        : "Choose workspace";

  return (
    <>
      <AlenioBottomSheet
        visible={visible}
        title={title}
        subtitle={
          stage === "tools"
            ? "Tools stay separate from the video call."
            : stage === "member"
              ? "Select who this check-in is for."
              : "Choose where this check-in should be saved."
        }
        onClose={closeSheet}
        compact
        showCloseButton
        headerRight={
          stage !== "tools" ? (
            <Pressable
              onPress={() => {
                setStage(stage === "workspace" ? "member" : "tools");
                if (stage === "workspace") setSelectedMemberId(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={19} color="#475569" />
            </Pressable>
          ) : null
        }
        testID="meeting-tools-sheet"
      >
        {loading ? (
          <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
        ) : error ? (
          <Text
            style={{
              paddingVertical: 18,
              fontSize: 12,
              lineHeight: 17,
              textAlign: "center",
              color: "#B42318",
            }}
          >
            {error}
          </Text>
        ) : stage === "tools" ? (
          <Pressable
            onPress={() => setStage("member")}
            disabled={uniqueMembers.length === 0}
            style={{
              minHeight: 58,
              paddingHorizontal: 12,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              borderWidth: 1,
              borderColor: "#E7EAF0",
              backgroundColor: "#FFFFFF",
              opacity: uniqueMembers.length === 0 ? 0.5 : 1,
            }}
            accessibilityRole="button"
            accessibilityLabel="Open check-in form"
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F0ECFF",
              }}
            >
              <ClipboardCheck size={18} color="#684BFF" strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#172033" }}>
                Check-in form
              </Text>
              <Text style={{ marginTop: 2, fontSize: 10.5, color: "#748097" }}>
                {uniqueMembers.length > 0
                  ? "Start a check-in with a participant."
                  : "Waiting for an eligible participant to join."}
              </Text>
            </View>
            <ChevronRight size={17} color="#94A3B8" />
          </Pressable>
        ) : stage === "member" ? (
          <View style={{ gap: 7 }}>
            {uniqueMembers.length === 0 ? (
              <Text
                style={{
                  paddingVertical: 18,
                  textAlign: "center",
                  fontSize: 11,
                  color: "#748097",
                }}
              >
                No eligible workspace participants are currently in this call.
              </Text>
            ) : (
              uniqueMembers.map((pair) => (
                <Pressable
                  key={pair.member.id}
                  onPress={() => chooseMember(pair)}
                  style={{
                    minHeight: 52,
                    paddingHorizontal: 10,
                    borderRadius: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    borderWidth: 1,
                    borderColor: "#EEF0F4",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <UserAvatar user={pair.member} size={32} radius={16} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, fontWeight: "700", color: "#172033" }}
                    >
                      {memberName(pair)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ marginTop: 1, fontSize: 9.5, color: "#8490A4" }}
                    >
                      {eligiblePairs.filter(
                        (candidate) => candidate.member.id === pair.member.id,
                      ).length > 1
                        ? "Choose workspace"
                        : pair.workspace.name}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#94A3B8" />
                </Pressable>
              ))
            )}
          </View>
        ) : (
          <View style={{ gap: 7 }}>
            {selectedMemberPairs.map((pair) => (
              <Pressable
                key={pair.workspace.id}
                onPress={() => launch(pair)}
                style={{
                  minHeight: 50,
                  paddingHorizontal: 11,
                  borderRadius: 13,
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#EEF0F4",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 12, fontWeight: "700", color: "#172033" }}
                >
                  {pair.workspace.name}
                </Text>
                <ChevronRight size={16} color="#94A3B8" />
              </Pressable>
            ))}
          </View>
        )}
      </AlenioBottomSheet>

      {activePair ? (
        <View
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
        >
          <OneOnOneHistoryTab
            teamId={activePair.workspace.id}
            memberUserId={activePair.member.id}
            memberName={memberName(activePair)}
            memberImage={activePair.member.image}
            managerName={leaderName}
            leaderUserId={leaderUserId}
            canCreate
            canModify
            myRole="team_leader"
            startCheckInToken={launchToken}
            sourceVideoRoomId={roomId}
            sourceCalendarEventId={context?.calendarEventId ?? null}
            meetingToolMode
            meetingToolHeaderControls={formHeaderControls}
            onFlowActiveChange={handleFlowActiveChange}
            onFormActiveChange={onFormActiveChange}
            onDraftSaveReady={onDraftSaveReady}
            callTranscript={callTranscript ?? null}
            callTranscriptActive={callTranscriptActive ?? false}
            onStopCallTranscript={onStopCallTranscript}
            onCallTranscriptWrittenUp={onCallTranscriptWrittenUp}
          />
        </View>
      ) : null}
    </>
  );
}
