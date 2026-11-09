import {
  Bell,
  CalendarDays,
  SquareCheckBig,
  Users,
  Video,
} from "lucide-react-native";
import type { HomeTodayItemType } from "@/lib/types";

const ICONS = {
  task: SquareCheckBig,
  reminder: Bell,
  event: CalendarDays,
  meeting: Video,
  check_in: Users,
  holiday: CalendarDays,
  external: CalendarDays,
} as const;

const GRAY = "#98A2B3";

export function ScheduleKindIcon({
  kind,
  size = 14,
  color = GRAY,
}: {
  kind: HomeTodayItemType;
  size?: number;
  color?: string;
}) {
  const Icon = ICONS[kind] ?? CalendarDays;
  return <Icon size={size} color={color} strokeWidth={2.1} />;
}
