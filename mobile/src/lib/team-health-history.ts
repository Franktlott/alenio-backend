export type TeamHealthHistoryPoint = {
  date: string;
  teamHealthPct: number;
  checkInPct: number | null;
  goalsPct: number | null;
  tasksPct: number;
  memberCount: number;
  capturedAt: string;
};
