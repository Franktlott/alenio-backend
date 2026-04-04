export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type RecurrenceType = "daily" | "weekly" | "monthly" | "custom";
export type TeamRole = "owner" | "admin" | "member";

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  role: TeamRole;
  createdAt: string;
  _count?: { members: number; tasks: number };
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  role: TeamRole;
  userId: string;
  teamId: string;
  joinedAt: string;
  user: User;
}

export interface RecurrenceRule {
  id: string;
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: string | null;
  dayOfMonth?: number | null;
  nextDueAt?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  teamId: string;
  creatorId: string;
  creator: User;
  assignments: { id: string; userId: string; user: User }[];
  recurrenceRule?: RecurrenceRule | null;
  team?: { id: string; name: string };
}

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string };
}

export interface Message {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  replyToId?: string | null;
  replyTo?: { id: string; content?: string | null; sender: { id: string; name: string } } | null;
  reactions: MessageReaction[];
  createdAt: string;
  teamId: string;
  senderId: string;
  sender: User;
}

export interface DirectMessage {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  replyToId?: string | null;
  replyTo?: { id: string; content?: string | null; sender: { id: string; name: string } } | null;
  reactions: MessageReaction[];
  createdAt: string;
  conversationId: string;
  senderId: string;
  sender: User;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  name?: string | null;
  participants?: User[];
  createdAt: string;
  updatedAt: string;
  recipient: User | null;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    sender: { id: string; name: string };
  } | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
  recurrence?: {
    type: RecurrenceType;
    interval: number;
    daysOfWeek?: string;
    dayOfMonth?: number;
  };
}
