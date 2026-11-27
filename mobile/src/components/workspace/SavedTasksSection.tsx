import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ListChecks,
  RefreshCw,
  Users,
} from "lucide-react-native";
import type { TaskPriority, TaskTemplate } from "@/lib/types";
import { AlenioBottomSheet, AlenioSheetCard } from "@/components/AlenioBottomSheet";
import { Button } from "@/components/ui";
import { WS } from "./workspace-ui";

type TemplatePriority = Extract<TaskPriority, "low" | "medium" | "high">;

const PRIORITIES: { label: string; value: TemplatePriority; color: string }[] = [
  { label: "Low", value: "low", color: "#94A3B8" },
  { label: "Medium", value: "medium", color: "#3B82F6" },
  { label: "High", value: "high", color: "#F97316" },
];

const CARD_WIDTH = 148;
const CARD_GAP = 8;
const CARD_STEP = CARD_WIDTH + CARD_GAP;

function toTemplatePriority(priority: TaskPriority): TemplatePriority {
  if (priority === "low") return "low";
  if (priority === "high" || priority === "urgent") return "high";
  return "medium";
}

function priorityLabel(priority: TaskPriority): string {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Medium";
}

function priorityColor(priority: TaskPriority): string {
  if (priority === "urgent") return "#EF4444";
  if (priority === "high") return "#F97316";
  if (priority === "low") return "#94A3B8";
  return "#3B82F6";
}

function recurrenceLabel(template: TaskTemplate): string | null {
  if (!template.isRecurring || !template.recurrenceType) return null;
  const count = template.recurrenceInterval
    ? ` · ${template.recurrenceInterval}×`
    : "";
  const type =
    template.recurrenceType === "daily"
      ? "Daily"
      : template.recurrenceType === "weekly"
        ? "Weekly"
        : "Monthly";
  return `${type}${count}`;
}

function templateSubtaskCount(template: TaskTemplate): string {
  const n = template.subtasks?.length ?? 0;
  return `${n} ${n === 1 ? "subtask" : "subtasks"}`;
}

type Props = {
  templates: TaskTemplate[];
  onUse: (template: TaskTemplate) => void;
  onBrowseAll?: () => void;
  onUpdate?: (
    template: TaskTemplate,
    data: { title: string; description: string; priority: TemplatePriority },
  ) => Promise<void> | void;
  onDelete?: (template: TaskTemplate) => Promise<void> | void;
  updating?: boolean;
};

/**
 * Compact, collapsible template shelf under the Tasks feed.
 * Hidden when empty so it doesn’t spend vertical space.
 */
export function SavedTasksSection({
  templates,
  onUse,
  onBrowseAll,
  onUpdate,
  onDelete,
  updating = false,
}: Props) {
  const canManage = Boolean(onUpdate || onDelete);
  const scrollRef = useRef<ScrollView>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TemplatePriority>("medium");
  const [saving, setSaving] = useState(false);

  const viewing = useMemo(
    () =>
      viewingId
        ? (templates.find((template) => template.id === viewingId) ?? null)
        : null,
    [templates, viewingId],
  );

  useEffect(() => {
    if (viewingId && !templates.some((template) => template.id === viewingId)) {
      setViewingId(null);
    }
  }, [templates, viewingId]);

  const maxScrollX = Math.max(0, contentWidth - viewportWidth);
  const showMoreArrow =
    templates.length > 0 && maxScrollX > 8 && scrollX < maxScrollX - 8;

  const openDetail = (template: TaskTemplate) => {
    setViewingId(template.id);
  };

  const closeDetail = () => {
    if (editing || saving) return;
    setViewingId(null);
  };

  const openEdit = (template: TaskTemplate) => {
    setEditing(template);
    setEditTitle(template.title);
    setEditDescription(template.description ?? "");
    setEditPriority(toTemplatePriority(template.priority));
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const confirmDelete = (template: TaskTemplate) => {
    if (!onDelete) return;
    Alert.alert(
      "Delete saved template?",
      `Remove “${template.title}” from Saved templates. This can’t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await onDelete(template);
              setEditing(null);
              setViewingId(null);
            })();
          },
        },
      ],
    );
  };

  const saveEdit = async () => {
    if (!editing || !onUpdate || !editTitle.trim()) return;
    setSaving(true);
    try {
      await onUpdate(editing, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        priority: editPriority,
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const useFromDetail = () => {
    if (!viewing) return;
    const template = viewing;
    setViewingId(null);
    onUse(template);
  };

  const onCarouselLayout = (event: LayoutChangeEvent) => {
    setViewportWidth(event.nativeEvent.layout.width);
  };

  const onCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(event.nativeEvent.contentOffset.x);
  };

  const scrollMore = () => {
    const next = Math.min(scrollX + CARD_STEP, maxScrollX);
    scrollRef.current?.scrollTo({ x: next, animated: true });
  };

  if (templates.length === 0) return null;

  return (
    <View style={styles.wrap} testID="saved-tasks-section">
      <Pressable
        onPress={() => setExpanded((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded
            ? "Collapse saved templates"
            : `Expand saved templates, ${templates.length}`
        }
        testID="saved-templates-toggle"
        style={({ pressed }) => [
          styles.bar,
          pressed ? styles.barPressed : null,
        ]}
      >
        <View style={styles.barIcon}>
          <Bookmark size={13} color="#7C3AED" strokeWidth={2.3} />
        </View>
        <Text style={styles.barTitle} numberOfLines={1}>
          Saved templates
        </Text>
        <Text style={styles.count}>{templates.length}</Text>
        <View style={{ flex: 1 }} />
        {onBrowseAll && templates.length > 2 ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onBrowseAll();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="View all saved templates"
            testID="saved-tasks-browse"
            style={styles.viewAllHit}
          >
            <Text style={styles.viewAll}>View All</Text>
          </Pressable>
        ) : null}
        <ChevronDown
          size={15}
          color="#94A3B8"
          strokeWidth={2.3}
          style={{
            transform: [{ rotate: expanded ? "180deg" : "0deg" }],
          }}
        />
      </Pressable>

      {expanded ? (
        templates.length === 1 ? (
          (() => {
            const template = templates[0]!;
            const accent = priorityColor(template.priority);
            return (
              <Pressable
                onPress={() => openDetail(template)}
                style={styles.cardSingle}
                accessibilityRole="button"
                accessibilityLabel={`View saved template ${template.title}`}
                testID={`saved-task-${template.id}`}
              >
                <View
                  style={[styles.cardIcon, { backgroundColor: `${accent}14` }]}
                >
                  {template.attachmentUrl ? (
                    <Image
                      source={{ uri: template.attachmentUrl }}
                      style={styles.cardThumb}
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <Bookmark size={13} color={accent} strokeWidth={2.3} />
                  )}
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {template.title}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {templateSubtaskCount(template)}
                    </Text>
                    {template.isRecurring ? (
                      <RefreshCw size={10} color="#7C3AED" strokeWidth={2.4} />
                    ) : (
                      <View
                        style={[styles.priorityDot, { backgroundColor: accent }]}
                      />
                    )}
                  </View>
                </View>
                <ChevronRight size={14} color="#C4C9D4" strokeWidth={2.2} />
              </Pressable>
            );
          })()
        ) : (
          <View style={styles.carouselWrap} onLayout={onCarouselLayout}>
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={CARD_STEP}
              snapToAlignment="start"
              disableIntervalMomentum
              contentContainerStyle={styles.carouselContent}
              onScroll={onCarouselScroll}
              scrollEventThrottle={16}
              onContentSizeChange={(width) => setContentWidth(width)}
              testID="saved-tasks-carousel"
            >
              {templates.map((template) => {
                const accent = priorityColor(template.priority);
                return (
                  <Pressable
                    key={template.id}
                    onPress={() => openDetail(template)}
                    style={styles.card}
                    accessibilityRole="button"
                    accessibilityLabel={`View saved template ${template.title}`}
                    testID={`saved-task-${template.id}`}
                  >
                    <View
                      style={[
                        styles.cardIcon,
                        { backgroundColor: `${accent}14` },
                      ]}
                    >
                      {template.attachmentUrl ? (
                        <Image
                          source={{ uri: template.attachmentUrl }}
                          style={styles.cardThumb}
                          accessibilityIgnoresInvertColors
                        />
                      ) : (
                        <Bookmark size={13} color={accent} strokeWidth={2.3} />
                      )}
                    </View>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {template.title}
                      </Text>
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {templateSubtaskCount(template)}
                        </Text>
                        {template.isRecurring ? (
                          <RefreshCw
                            size={10}
                            color="#7C3AED"
                            strokeWidth={2.4}
                          />
                        ) : (
                          <View
                            style={[
                              styles.priorityDot,
                              { backgroundColor: accent },
                            ]}
                          />
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {showMoreArrow ? (
              <Pressable
                onPress={scrollMore}
                accessibilityRole="button"
                accessibilityLabel="See more saved templates"
                testID="saved-tasks-more-arrow"
                style={({ pressed }) => [
                  styles.moreArrow,
                  pressed ? styles.moreArrowPressed : null,
                ]}
              >
                <ChevronRight size={16} color="#7C3AED" strokeWidth={2.6} />
              </Pressable>
            ) : null}
          </View>
        )
      ) : null}

      <AlenioBottomSheet
        visible={viewing != null && editing == null}
        title="Saved template"
        subtitle="Blueprint for new tasks"
        onClose={closeDetail}
        showCloseButton
        compact
        testID="saved-task-detail-sheet"
        footer={
          viewing ? (
            <View style={{ width: "100%", gap: 10 }}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                label="Use template"
                onPress={useFromDetail}
                testID="saved-task-detail-use"
              />
              {canManage ? (
                <View style={styles.detailSecondaryRow}>
                  {onUpdate ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        variant="secondary"
                        size="lg"
                        fullWidth
                        label="Edit"
                        onPress={() => openEdit(viewing)}
                        testID="saved-task-detail-edit"
                      />
                    </View>
                  ) : null}
                  {onDelete ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        variant="secondary"
                        size="lg"
                        fullWidth
                        label="Delete"
                        onPress={() => confirmDelete(viewing)}
                        testID="saved-task-detail-delete"
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null
        }
      >
        {viewing ? (
          <View style={styles.detailBody} testID="saved-task-detail">
            <View style={styles.detailHero}>
              <View style={styles.detailHeroIcon}>
                <Bookmark size={18} color="#7C3AED" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.detailTitle}>{viewing.title}</Text>
                <View style={styles.detailChipRow}>
                  <View
                    style={[
                      styles.detailChip,
                      {
                        backgroundColor: `${priorityColor(viewing.priority)}18`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailChipText,
                        { color: priorityColor(viewing.priority) },
                      ]}
                    >
                      {priorityLabel(viewing.priority)}
                    </Text>
                  </View>
                  {viewing.isJoint ? (
                    <View style={[styles.detailChip, styles.detailChipMuted]}>
                      <Users size={12} color="#64748B" strokeWidth={2.2} />
                      <Text style={styles.detailChipMutedText}>Joint</Text>
                    </View>
                  ) : null}
                  {recurrenceLabel(viewing) ? (
                    <View style={[styles.detailChip, styles.detailChipMuted]}>
                      <RefreshCw size={12} color="#64748B" strokeWidth={2.2} />
                      <Text style={styles.detailChipMutedText}>
                        {recurrenceLabel(viewing)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {viewing.description?.trim() ? (
              <AlenioSheetCard tint="purple" compact>
                <Text style={styles.detailSectionLabel}>Description</Text>
                <Text style={styles.detailDescription}>
                  {viewing.description.trim()}
                </Text>
              </AlenioSheetCard>
            ) : null}

            {viewing.subtasks && viewing.subtasks.length > 0 ? (
              <AlenioSheetCard tint="purple" compact>
                <View style={styles.subtasksHeader}>
                  <ListChecks size={14} color="#7C3AED" strokeWidth={2.2} />
                  <Text style={styles.detailSectionLabel}>
                    Subtasks · {viewing.subtasks.length}
                  </Text>
                </View>
                <View style={styles.subtaskList}>
                  {[...viewing.subtasks]
                    .sort((a, b) => a.order - b.order)
                    .map((subtask, index) => (
                      <View
                        key={`${subtask.order}-${subtask.title}-${index}`}
                        style={styles.subtaskRow}
                      >
                        <View style={styles.subtaskDot} />
                        <Text style={styles.subtaskText}>{subtask.title}</Text>
                      </View>
                    ))}
                </View>
              </AlenioSheetCard>
            ) : null}

            {viewing.attachmentUrl ? (
              <View style={styles.attachmentWrap}>
                <Image
                  source={{ uri: viewing.attachmentUrl }}
                  style={styles.attachment}
                  resizeMode="cover"
                  accessibilityLabel="Saved template photo"
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={editing != null}
        title="Edit template"
        subtitle="Update what gets reused next time."
        onClose={closeEdit}
        showCloseButton
        compact
        scrollEnabled={false}
        testID="edit-saved-task-sheet"
        footer={
          <View style={{ width: "100%", gap: 10 }}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              label={saving || updating ? "Saving…" : "Save changes"}
              disabled={saving || updating || !editTitle.trim()}
              onPress={() => void saveEdit()}
              testID="edit-saved-task-save"
            />
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              label="Cancel"
              disabled={saving || updating}
              onPress={closeEdit}
              testID="edit-saved-task-cancel"
            />
          </View>
        }
      >
        <View style={styles.editBlock}>
          <Text style={styles.editLabel}>Title</Text>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Template title"
            placeholderTextColor="#94A3B8"
            style={styles.editInput}
            testID="edit-saved-task-title"
          />
          <Text style={[styles.editLabel, { marginTop: 12 }]}>Description</Text>
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder="Optional"
            placeholderTextColor="#94A3B8"
            style={[styles.editInput, styles.editMultiline]}
            multiline
            testID="edit-saved-task-description"
          />
          <Text style={[styles.editLabel, { marginTop: 12 }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const selected = editPriority === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setEditPriority(p.value)}
                  style={[
                    styles.priorityChip,
                    selected
                      ? {
                          backgroundColor: `${p.color}20`,
                          borderColor: p.color,
                        }
                      : null,
                  ]}
                  testID={`edit-saved-priority-${p.value}`}
                >
                  <Text
                    style={[
                      styles.priorityChipText,
                      { color: selected ? p.color : "#94A3B8" },
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {(saving || updating) && (
            <ActivityIndicator
              style={{ marginTop: 14 }}
              color="#7C3AED"
              testID="edit-saved-task-spinner"
            />
          )}
        </View>
      </AlenioBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    marginTop: 4,
    marginBottom: 2,
    gap: 5,
  },
  bar: {
    minHeight: 34,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 11,
    backgroundColor: "#F4F5F7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8EAED",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 6,
  },
  barPressed: {
    opacity: 0.88,
  },
  barIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  barTitle: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  count: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: WS.faint,
  },
  viewAllHit: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  viewAll: {
    fontSize: 11,
    fontWeight: "600",
    color: "#7C3AED",
  },
  carouselWrap: {
    position: "relative",
  },
  carouselContent: {
    paddingRight: 30,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: "#F4F5F7",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardSingle: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: "#F4F5F7",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  cardThumb: {
    width: 26,
    height: 26,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  cardTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardMeta: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moreArrow: {
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8EAED",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  moreArrowPressed: {
    opacity: 0.85,
  },
  detailBody: {
    gap: 12,
  },
  detailHero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  detailHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3FF",
  },
  detailTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#0F172A",
  },
  detailChipRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  detailChip: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailChipMuted: {
    backgroundColor: "#F1F5F9",
  },
  detailChipMutedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  detailSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: "#7C3AED",
    textTransform: "uppercase",
  },
  detailDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: "#334155",
  },
  subtasksHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subtaskList: {
    marginTop: 8,
    gap: 8,
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  subtaskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: "#C4B5FD",
  },
  subtaskText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    color: "#334155",
  },
  attachmentWrap: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
  },
  attachment: {
    width: "100%",
    height: 160,
  },
  detailSecondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  editBlock: {
    gap: 0,
  },
  editLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  editInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: "#0F172A",
  },
  editMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  priorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  priorityChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  priorityChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
