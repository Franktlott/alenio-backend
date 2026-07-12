import type { ReactNode } from "react";
import type { ActivityFeedItem } from "./types";
import { TaskActivityCard } from "./TaskActivityCard";
import { EventActivityCard } from "./EventActivityCard";
import { TeamActivityCard } from "./TeamActivityCard";
import { MilestoneActivityCard } from "./MilestoneActivityCard";
import { CelebrationActivityCard } from "./CelebrationActivityCard";

type Props = {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  onCelebrate?: (item: ActivityFeedItem) => void;
  testID?: string;
};

export function ActivityFeedCard({ item, footer, onLongPress, onCelebrate, testID }: Props) {
  const shared = {
    item,
    footer,
    onLongPress,
    testID: testID ?? `activity-feed-card-${item.id}`,
  };

  switch (item.type) {
    case "task_completed":
    case "task_assigned":
      return <TaskActivityCard {...shared} />;
    case "calendar_event_added":
      return <EventActivityCard {...shared} />;
    case "member_joined":
    case "member_removed":
      return <TeamActivityCard {...shared} />;
    case "task_milestone":
    case "personal_best":
      return <MilestoneActivityCard {...shared} onCelebrate={onCelebrate} />;
    case "celebration":
      return <CelebrationActivityCard {...shared} onCelebrate={onCelebrate} />;
    default:
      return <TaskActivityCard {...shared} />;
  }
}
