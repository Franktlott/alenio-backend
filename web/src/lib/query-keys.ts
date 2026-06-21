export const queryKeys = {
  activity: (teamId: string) => ["activity", teamId] as const,
  dashboard: (teamId: string) => ["dashboard", teamId] as const,
  teamContext: (teamId: string) => ["team", "context", teamId] as const,
  teamSubscription: (teamId: string) => ["team", "subscription", teamId] as const,
  teamDetail: (teamId: string) => ["team", "detail", teamId] as const,
  chatTopics: (teamId: string) => ["chat", "topics", teamId] as const,
  chatConversations: ["chat", "conversations"] as const,
  chatThread: (mode: "dm" | "team", threadId: string) => ["chat", "thread", mode, threadId] as const,
  upcomingVideoMeetings: ["upcoming-video-meetings"] as const,
  pendingCalendarEvents: (teamId: string) => ["calendar", "pending", teamId] as const,
  checklistLocations: (teamId: string) => ["checklist-locations", teamId] as const,
  checklistSubmissions: (teamId: string, locationId: string, since?: string) =>
    ["checklist-submissions", teamId, locationId, since ?? "all"] as const,
};
