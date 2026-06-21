import React from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertCircle, Calendar, ChevronRight, ClipboardList, X } from "lucide-react-native";
import type { Task } from "@/lib/types";

export type TeamOverviewTaskFilter = "open" | "dueToday" | "overdue";

type Props = {
  visible: boolean;
  filter: TeamOverviewTaskFilter;
  tasks: Task[];
  onClose: () => void;
  onTaskPress: (task: Task) => void;
};

const MAX_VISIBLE_ROWS = 4;
const ROW_HEIGHT = 68;

const FILTER_CONFIG: Record<
  TeamOverviewTaskFilter,
  {
    title: string;
    subtitle: (count: number) => string;
    empty: string;
    iconBg: string;
    iconColor: string;
    Icon: typeof AlertCircle;
  }
> = {
  open: {
    title: "Open tasks",
    subtitle: (count) => `${count} incomplete ${count === 1 ? "task" : "tasks"}`,
    empty: "No open tasks",
    iconBg: "#D1FAE5",
    iconColor: "#10B981",
    Icon: ClipboardList,
  },
  dueToday: {
    title: "Due today",
    subtitle: (count) => `${count} ${count === 1 ? "task is" : "tasks are"} due today`,
    empty: "Nothing due today",
    iconBg: "#FEF3C7",
    iconColor: "#F59E0B",
    Icon: Calendar,
  },
  overdue: {
    title: "Overdue tasks",
    subtitle: (count) => `${count} ${count === 1 ? "task needs" : "tasks need"} attention`,
    empty: "No overdue tasks",
    iconBg: "#FEE2E2",
    iconColor: "#EF4444",
    Icon: AlertCircle,
  },
};

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function assigneeLabel(task: Task): string {
  const names = task.assignments?.map((a) => a.user?.name).filter(Boolean) as string[] | undefined;
  if (!names?.length) return "Unassigned";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

function taskMeta(task: Task, filter: TeamOverviewTaskFilter): string {
  const assignee = assigneeLabel(task);
  if (filter === "open" && !task.dueDate) return assignee;
  if (task.dueDate) return `${assignee} · Due ${formatDueDate(task.dueDate)}`;
  return assignee;
}

export function TeamOverviewTasksSheet({ visible, filter, tasks, onClose, onTaskPress }: Props) {
  const insets = useSafeAreaInsets();
  const config = FILTER_CONFIG[filter];
  const { Icon } = config;
  const listMaxHeight = Math.min(tasks.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;
  const hasMore = tasks.length > MAX_VISIBLE_ROWS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ maxHeight: "78%" }}>
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center" }} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 12,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>{config.title}</Text>
                <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{config.subtitle(tasks.length)}</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} color="#64748B" />
              </Pressable>
            </View>

            {tasks.length === 0 ? (
              <View style={{ paddingHorizontal: 20, paddingVertical: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: "#64748B" }}>{config.empty}</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: listMaxHeight }}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                showsVerticalScrollIndicator={hasMore}
                nestedScrollEnabled
              >
                {tasks.map((task, index) => (
                  <Pressable
                    key={task.id}
                    onPress={() => onTaskPress(task)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#F1F5F9",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: config.iconBg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={18} color={config.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>
                        {task.title}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {taskMeta(task, filter)}
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#CBD5E1" />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
