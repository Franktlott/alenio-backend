import {
  Activity as ActivityIcon,
  CheckCircle2,
  ClipboardList,
  Flame,
  ListChecks,
  MapPinned,
  Megaphone,
  MessageSquare,
  Target,
  Thermometer,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import type { SnapshotIconKey } from "@/components/workspace/snapshot/snapshot-types";

export const SNAPSHOT_ICONS: Record<SnapshotIconKey, LucideIcon> = {
  tasks: ClipboardList,
  completed: CheckCircle2,
  team: Users,
  members: Users,
  streak: Flame,
  checkins: MessageSquare,
  health: ActivityIcon,
  recognition: Trophy,
  goals: Target,
  briefings: Megaphone,
  temps: Thermometer,
  checklists: ListChecks,
  walks: MapPinned,
};
