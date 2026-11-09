import type { Href } from "expo-router";

export function scheduleMeetingHref(teamId: string): Href {
  return {
    pathname: "/(app)/execute",
    params: {
      teamId,
      openModal: "meeting",
    },
  };
}

export function scheduleCheckInHref(teamId: string): Href {
  return {
    pathname: "/(app)/execute",
    params: {
      teamId,
      openModal: "checkin",
    },
  };
}

export function videoCallHref(roomId: string, roomName: string): Href {
  return {
    pathname: "/video-call",
    params: { roomId, roomName },
  };
}
