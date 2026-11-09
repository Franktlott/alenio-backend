import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Eye,
  ListFilter,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api, ApiError } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import type { WorkplaceStandards } from "@/lib/workplace-standards";
import {
  addCheckInTemplateFromLibrary,
  deleteCheckInTemplate,
  fetchCheckInTemplateLibrary,
  fetchCheckInTemplates,
  type CheckInLibraryTemplate,
  type CheckInTemplate,
} from "@/lib/check-in-templates-api";
import {
  CHECK_IN_LIBRARY_CATEGORIES,
  CHECK_IN_TEMPLATE_SORT_LABELS,
  checkInLibraryCategory,
  checkInLibraryDescription,
  filterCheckInLibrary,
  filterCheckInLibraryByCategory,
  filterCheckInTemplates,
  sortCheckInLibrary,
  sortCheckInTemplates,
  type CheckInLibraryCategory,
  type CheckInLibraryCategoryFilter,
  type CheckInTemplateSort,
} from "@/lib/check-in-template-directory";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import {
  countTemplateQuestions,
  fieldsToTemplateSections,
} from "@/lib/check-in-template-editor";
import { useTeamStore } from "@/lib/state/team-store";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { canManageWorkspace } from "@/lib/workspace-management";
import { colors } from "@/theme";

const LIBRARY_MARKS: Record<
  CheckInLibraryCategory,
  {
    icon: typeof MessageCircle;
    color: string;
    background: string;
  }
> = {
  Coaching: { icon: MessageCircle, color: "#7C5CFC", background: "#F3EEFF" },
  Development: { icon: TrendingUp, color: "#12B981", background: "#E7F8F1" },
  Onboarding: { icon: UserRound, color: "#F08A5D", background: "#FFF1E8" },
  Team: { icon: CalendarDays, color: "#6366F1", background: "#EEF2FF" },
};

function EmptyHills() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 360 180"
      preserveAspectRatio="none"
    >
      <Path
        d="M0 86 C72 64 128 28 188 50 C252 74 304 24 360 46 L360 180 L0 180 Z"
        fill="#E3EDF6"
      />
      <Path
        d="M0 118 C84 96 154 78 214 104 C274 130 322 96 360 112 L360 180 L0 180 Z"
        fill="#F4F8FB"
      />
      <Path
        d="M0 146 C96 132 176 156 252 138 C312 126 338 142 360 140 L360 180 L0 180 Z"
        fill="#EAF2F8"
        opacity={0.9}
      />
    </Svg>
  );
}

function LibraryExploreArt() {
  return (
    <View style={styles.libraryArt} accessibilityElementsHidden>
      <View style={styles.libraryArtBlob} />
      <View style={styles.libraryArtCard}>
        <View style={styles.libraryArtRow}>
          <View style={styles.libraryArtBox} />
          <View style={styles.libraryArtLine} />
        </View>
        <View style={styles.libraryArtRow}>
          <View style={[styles.libraryArtBox, styles.libraryArtBoxDone]} />
          <View style={[styles.libraryArtLine, { width: 26 }]} />
        </View>
      </View>
    </View>
  );
}

function previewAnswerHint(type: string, ratingMax?: number): string {
  if (type === "rating") return `Rating, 1 to ${ratingMax ?? 5}`;
  if (type === "yes_no") return "Yes or no";
  if (type === "short_text") return "Short answer";
  return "Written answer";
}

function formatUpdatedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return `Updated ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })}`;
}

export default function CheckInTemplatesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const teamId =
    (typeof params.teamId === "string" && params.teamId) || activeTeamId || "";
  const { access, isLoading: accessLoading } = useWorkspaceAccess(teamId);
  const [preview, setPreview] = useState<{
    title: string;
    description: string | null;
    fields: CheckInTemplate["fields"];
    leaderPrep?: string[];
  } | null>(null);
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [libraryCategory, setLibraryCategory] =
    useState<CheckInLibraryCategoryFilter>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CheckInTemplateSort>("recent");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [addingLibraryKey, setAddingLibraryKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CheckInTemplate | null>(
    null,
  );
  const [deleteBlock, setDeleteBlock] = useState<{
    title: string;
    message: string;
    blocked: boolean;
  } | null>(null);

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () =>
      api.get<Team & { workplaceStandards?: WorkplaceStandards }>(
        `/api/teams/${teamId}`,
      ),
    enabled: Boolean(teamId),
  });
  const role = teamQuery.data?.role?.toLowerCase() ?? "";
  const canManage = canManageWorkspace(role);

  const templatesQuery = useQuery({
    queryKey: ["one-on-one-templates", teamId],
    queryFn: () => fetchCheckInTemplates(teamId),
    enabled: Boolean(teamId && canManage),
    refetchOnMount: true,
  });

  const libraryQuery = useQuery({
    queryKey: ["check-in-template-library"],
    queryFn: fetchCheckInTemplateLibrary,
    enabled: Boolean(teamId && canManage),
    staleTime: 10 * 60 * 1000,
  });

  const addFromLibraryMutation = useMutation({
    mutationFn: (libraryKey: string) =>
      addCheckInTemplateFromLibrary(teamId, libraryKey),
    onMutate: (libraryKey: string) => setAddingLibraryKey(libraryKey),
    onSettled: () => setAddingLibraryKey(null),
    onSuccess: (added) => {
      void queryClient.invalidateQueries({
        queryKey: ["one-on-one-templates", teamId],
      });
      setTab("mine");
      toast({ title: `“${added.title}” added`, preset: "done" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not add template",
        message: error.message || "Please try again.",
        preset: "error",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      deleteCheckInTemplate(teamId, templateId),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteBlock(null);
      void queryClient.invalidateQueries({
        queryKey: ["one-on-one-templates", teamId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["member-stats", teamId],
      });
      toast({ title: "Template deleted", preset: "done" });
    },
    onError: (error: Error) => {
      const code =
        error instanceof ApiError ? error.body?.error?.code : undefined;
      if (code === "TEMPLATE_REQUIRED_BY_WORKSPACE_STANDARDS") {
        setDeleteBlock({
          title: "Currently required by your standards",
          message: `“${deleteTarget?.title ?? "This template"}” is selected as the required check-in template. Choose “Any template” or a different template in Workspace Standards before deleting it.`,
          blocked: true,
        });
        return;
      }
      if (code === "TEMPLATE_HAS_FUTURE_CHECK_INS") {
        setDeleteBlock({
          title: "Used by a future check-in",
          message:
            "Reschedule, hide, reject, or remove future check-ins using this template before deleting it.",
          blocked: true,
        });
        return;
      }
      setDeleteBlock({
        title: "Deletion could not be completed",
        message: error.message || "Please try again.",
        blocked: false,
      });
    },
  });

  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const library = useMemo(() => libraryQuery.data ?? [], [libraryQuery.data]);
  const ownedLibraryKeys = useMemo(
    () =>
      new Set(
        templates
          .map((template) => template.libraryKey)
          .filter((key): key is string => Boolean(key)),
      ),
    [templates],
  );
  const requiredTemplateId =
    teamQuery.data?.workplaceStandards?.requiredCheckInTemplateId ?? null;
  const visibleTemplates = useMemo(
    () => sortCheckInTemplates(filterCheckInTemplates(templates, search), sort),
    [templates, search, sort],
  );
  const visibleLibrary = useMemo(
    () =>
      filterCheckInLibraryByCategory(
        sortCheckInLibrary(filterCheckInLibrary(library, search), sort),
        libraryCategory,
      ),
    [library, search, sort, libraryCategory],
  );

  /**
   * Short lists are quicker to read than to search. Kept visible once a search
   * is under way, so clearing it is always possible.
   */
  const showFilterRow =
    search.length > 0 ||
    (tab === "mine" ? templates.length > 4 : library.length > 4);

  const openPlan = () =>
    router.push({ pathname: "/choose-plan", params: { teamId } });

  const editTemplate = (template?: CheckInTemplate) => {
    if (!access.canWrite) {
      openPlan();
      return;
    }
    router.push({
      pathname: "/check-in-template-editor",
      params: {
        teamId,
        ...(template ? { templateId: template.id } : {}),
      },
    });
  };

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} testID="check-in-templates-screen">
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No workspace selected</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={[]}
      testID="check-in-templates-screen"
    >
      <LinearGradient
        pointerEvents="none"
        colors={["#E6DCFF", "#F4F0FF", "#F7F5FC"]}
        locations={[0, 0.42, 1]}
        style={styles.headerWash}
      />
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerAction}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="check-in-templates-back"
        >
          <ArrowLeft size={19} color="#172033" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.topTitle}>Check-in Templates</Text>
          <Text style={styles.topSubtitle}>
            Build consistent, meaningful conversations
          </Text>
        </View>
        <Pressable
          onPress={() => editTemplate()}
          hitSlop={8}
          style={styles.headerAddAction}
          accessibilityRole="button"
          accessibilityLabel="Create check-in template"
          testID="new-check-in-template-header"
        >
          <Plus size={19} color="#FFFFFF" strokeWidth={2.3} />
        </Pressable>
      </View>

      {teamQuery.isLoading || templatesQuery.isLoading || accessLoading ? (
        <View style={styles.center} testID="check-in-templates-loading">
          <View style={styles.stateIcon}>
            <ActivityIndicator color={colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>Loading your library</Text>
          <Text style={styles.stateBody}>Loading templates…</Text>
        </View>
      ) : !canManage ? (
        <View style={styles.center} testID="check-in-templates-forbidden">
          <View style={styles.stateIcon}>
            <ClipboardList size={25} color={colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>
            Template management is for workspace leaders
          </Text>
          <Text style={styles.stateBody}>
            Ask an owner or team leader to manage these check-ins.
          </Text>
        </View>
      ) : templatesQuery.isError ? (
        <View style={styles.center} testID="check-in-templates-error">
          <View style={[styles.stateIcon, styles.stateIconError]}>
            <RefreshCw size={23} color="#EF4444" />
          </View>
          <Text style={styles.emptyTitle}>Couldn’t load templates</Text>
          <Text style={styles.stateBody}>
            {templatesQuery.error instanceof Error
              ? templatesQuery.error.message
              : "Please try again."}
          </Text>
          <Pressable
            onPress={() => void templatesQuery.refetch()}
            style={styles.primaryButton}
            accessibilityRole="button"
            testID="retry-check-in-templates"
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tabs}>
            {(
              [
                { key: "mine" as const, label: "Your Templates" },
                { key: "library" as const, label: "Template Library" },
              ]
            ).map((option) => {
              const selected = tab === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setTab(option.key)}
                  style={[styles.tab, selected ? styles.tabSelected : null]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  testID={`check-in-templates-tab-${option.key}`}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      selected ? styles.tabLabelSelected : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* A search box over a handful of cards is more chrome than help,
              so it appears once the list is long enough to hunt through. */}
          {tab === "mine" && showFilterRow ? (
          <View style={styles.filterRow}>
            <View style={styles.searchField}>
              <Search size={14} color="#94A3B8" strokeWidth={2.2} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search templates..."
                placeholderTextColor="#9AA5B5"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="check-in-templates-search"
              />
              {search.length > 0 ? (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <X size={13} color="#94A3B8" strokeWidth={2.4} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setSortSheetOpen(true)}
              style={styles.sortButton}
              accessibilityRole="button"
              accessibilityLabel={`Sort templates. ${CHECK_IN_TEMPLATE_SORT_LABELS[sort]}`}
              testID="check-in-templates-sort"
            >
              <ListFilter size={14} color="#475569" strokeWidth={2.2} />
              <Text style={styles.sortButtonText}>Sort</Text>
            </Pressable>
          </View>
          ) : null}

          {tab === "library" ? (
            <>
              <View style={styles.libraryIntro}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.libraryTitle}>Explore templates</Text>
                  <Text style={styles.librarySubtitle}>
                    Start with a proven template and make it your own.
                  </Text>
                </View>
                <LibraryExploreArt />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {CHECK_IN_LIBRARY_CATEGORIES.map((category) => {
                  const selected = libraryCategory === category;
                  const mark =
                    category === "All" ? null : LIBRARY_MARKS[category];
                  const MarkIcon = mark?.icon;
                  return (
                    <Pressable
                      key={category}
                      onPress={() => setLibraryCategory(category)}
                      style={[
                        styles.categoryChip,
                        selected ? styles.categoryChipSelected : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={`check-in-library-category-${category}`}
                    >
                      {MarkIcon ? (
                        <MarkIcon
                          size={13}
                          color={selected ? "#FFFFFF" : mark.color}
                          strokeWidth={2.3}
                        />
                      ) : (
                        <View
                          style={[
                            styles.categoryAllDot,
                            selected ? styles.categoryAllDotSelected : null,
                          ]}
                        />
                      )}
                      <Text
                        style={[
                          styles.categoryChipText,
                          selected ? styles.categoryChipTextSelected : null,
                        ]}
                      >
                        {category}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {libraryQuery.isLoading ? (
                <ActivityIndicator
                  color={colors.brand}
                  style={{ marginVertical: 24 }}
                />
              ) : visibleLibrary.length === 0 ? (
                <View style={styles.noResults} testID="check-in-library-empty">
                  <Text style={styles.noResultsTitle}>
                    {library.length === 0
                      ? "The library is unavailable right now"
                      : "No templates in this category"}
                  </Text>
                  <Text style={styles.stateBody}>
                    {library.length === 0
                      ? "Please try again in a moment."
                      : "Try another category, or create your own template."}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }} testID="check-in-library-list">
                  {visibleLibrary.map((template: CheckInLibraryTemplate) => {
                    const added = ownedLibraryKeys.has(template.key);
                    const adding = addingLibraryKey === template.key;
                    const category = checkInLibraryCategory(template);
                    const mark = LIBRARY_MARKS[category];
                    const MarkIcon = mark.icon;
                    const questionCount = countTemplateQuestions(template.fields);
                    const description = checkInLibraryDescription(template);
                    return (
                      <View
                        key={template.key}
                        style={styles.libraryCard}
                        testID={`check-in-library-card-${template.key}`}
                      >
                        <Pressable
                          onPress={() =>
                            setPreview({
                              title: template.title,
                              description,
                              fields: template.fields,
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Preview ${template.title}`}
                          testID={`preview-check-in-library-${template.key}`}
                        >
                          <View style={styles.libraryCardTop}>
                            <View
                              style={[
                                styles.libraryIcon,
                                { backgroundColor: mark.background },
                              ]}
                            >
                              <MarkIcon
                                size={16}
                                color={mark.color}
                                strokeWidth={2.2}
                              />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.libraryCardTitle} numberOfLines={2}>
                                {template.title}
                              </Text>
                              <Text style={styles.libraryCardMeta}>
                                {questionCount} question
                                {questionCount === 1 ? "" : "s"} · {category}
                              </Text>
                            </View>
                            <ChevronRight
                              size={16}
                              color="#C5CDD8"
                              strokeWidth={2.2}
                            />
                          </View>
                        </Pressable>
                        <View style={styles.libraryCardBottom}>
                          {description ? (
                            <Text
                              style={styles.libraryCardDescription}
                              numberOfLines={2}
                            >
                              {description}
                            </Text>
                          ) : (
                            <View style={{ flex: 1 }} />
                          )}
                          <Pressable
                            onPress={() =>
                              access.canWrite
                                ? addFromLibraryMutation.mutate(template.key)
                                : openPlan()
                            }
                            disabled={added || adding}
                            style={[
                              styles.addTemplate,
                              added ? styles.addTemplateDone : null,
                            ]}
                            accessibilityRole="button"
                            testID={`add-check-in-library-${template.key}`}
                          >
                            {adding ? (
                              <ActivityIndicator
                                size="small"
                                color={added ? "#0F9D6E" : "#FFFFFF"}
                              />
                            ) : (
                              <View style={styles.addTemplateInner}>
                                {added ? (
                                  <Check size={12} color="#0F9D6E" strokeWidth={2.6} />
                                ) : (
                                  <Plus size={12} color="#FFFFFF" strokeWidth={2.6} />
                                )}
                                <Text
                                  style={[
                                    styles.addTemplateText,
                                    added ? styles.addTemplateTextDone : null,
                                  ]}
                                >
                                  {added ? "Added" : "Add"}
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : templates.length === 0 ? (
            <View style={styles.emptyWrap} testID="check-in-templates-empty">
              <View style={styles.emptyMark}>
                <MessageCircle size={28} color="#1B2430" strokeWidth={2.1} />
              </View>
              <Text style={styles.emptyHeadline}>
                Start a meaningful{"\n"}conversation
              </Text>
              <Text style={styles.emptyBody}>
                Add a check-in template to keep your conversations focused and
                consistent.
              </Text>
              <View style={styles.emptyStage}>
                <View style={styles.emptyHills} pointerEvents="none">
                  <EmptyHills />
                </View>
                <Pressable
                  onPress={() => setTab("library")}
                  style={styles.emptyChoice}
                  accessibilityRole="button"
                  accessibilityLabel="Explore the library"
                  testID="empty-browse-check-in-library"
                >
                  <View style={styles.emptyChoiceRow}>
                    <View style={styles.emptyChoiceIcon}>
                      <BookOpen size={18} color="#1B2430" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.emptyChoiceTitle}>
                        Explore the library
                      </Text>
                      <Text style={styles.emptyChoiceBody}>
                        Choose from ready-to-use templates
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#C5CDD8" strokeWidth={2.2} />
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => editTemplate()}
                  style={styles.emptyChoice}
                  accessibilityRole="button"
                  accessibilityLabel="Create your own"
                  testID="empty-new-check-in-template"
                >
                  <View style={styles.emptyChoiceRow}>
                    <View style={styles.emptyChoiceIcon}>
                      <Plus size={18} color="#1B2430" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.emptyChoiceTitle}>
                        Create your own
                      </Text>
                      <Text style={styles.emptyChoiceBody}>
                        Build a custom check-in from scratch
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#C5CDD8" strokeWidth={2.2} />
                  </View>
                </Pressable>
              </View>
            </View>
          ) : visibleTemplates.length === 0 ? (
            <View style={styles.noResults} testID="check-in-templates-no-results">
              <Text style={styles.noResultsTitle}>No templates match that search</Text>
              <Text style={styles.stateBody}>
                Try a different word, or browse the template library.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }} testID="check-in-templates-list">
              {visibleTemplates.map((template) => (
                <View
                  key={template.id}
                  style={styles.card}
                  testID={`check-in-template-card-${template.id}`}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <CalendarDays size={16} color={colors.brand} strokeWidth={2.1} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {template.title}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {countTemplateQuestions(template.fields)} question
                        {countTemplateQuestions(template.fields) === 1
                          ? ""
                          : "s"}{" "}
                        · {formatUpdatedDate(template.updatedAt)}
                      </Text>
                    </View>
                  </View>
                  {template.description ? (
                    <Text style={styles.cardDescription} numberOfLines={3}>
                      {template.description}
                    </Text>
                  ) : null}
                  {template.libraryKey || template.id === requiredTemplateId ? (
                    <View style={styles.chipRow}>
                      {template.id === requiredTemplateId ? (
                        <View style={[styles.chip, styles.chipRequired]}>
                          <Text style={[styles.chipText, styles.chipTextRequired]}>
                            Required check-in
                          </Text>
                        </View>
                      ) : null}
                      {template.libraryKey ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>From library</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() => setPreview(template)}
                      style={styles.secondaryAction}
                      accessibilityRole="button"
                      testID={`preview-check-in-template-${template.id}`}
                    >
                      <Eye size={14} color="#475569" />
                      <Text style={styles.secondaryActionText}>Preview</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => editTemplate(template)}
                      style={styles.secondaryAction}
                      accessibilityRole="button"
                      testID={`edit-check-in-template-${template.id}`}
                    >
                      <Pencil size={14} color={colors.brand} />
                      <Text
                        style={[
                          styles.secondaryActionText,
                          { color: colors.brand },
                        ]}
                      >
                        Edit
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        access.canWrite
                          ? (setDeleteBlock(null), setDeleteTarget(template))
                          : openPlan()
                      }
                      style={styles.deleteAction}
                      accessibilityRole="button"
                      testID={`delete-check-in-template-${template.id}`}
                    >
                      <Trash2 size={15} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* One quiet way across to the catalogue, for people who do not read
              the tab above as a place to get new templates. */}
          {tab === "mine" && templates.length > 0 ? (
            <Pressable
              onPress={() => setTab("library")}
              style={styles.libraryLink}
              accessibilityRole="button"
              testID="browse-check-in-library"
            >
              <Text style={styles.libraryLinkText}>Browse template library</Text>
              <ArrowRight size={14} color={colors.brand} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <AlenioBottomSheet
        visible={sortSheetOpen}
        title="Sort templates"
        onClose={() => setSortSheetOpen(false)}
        compact
        showCloseButton
        testID="check-in-templates-sort-sheet"
      >
        <View style={{ gap: 6 }}>
          {(Object.keys(CHECK_IN_TEMPLATE_SORT_LABELS) as CheckInTemplateSort[]).map(
            (option) => {
              const selected = sort === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setSort(option);
                    setSortSheetOpen(false);
                  }}
                  style={[
                    styles.sortOption,
                    selected ? styles.sortOptionSelected : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`check-in-templates-sort-${option}`}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      selected ? styles.sortOptionTextSelected : null,
                    ]}
                  >
                    {CHECK_IN_TEMPLATE_SORT_LABELS[option]}
                  </Text>
                  {selected ? (
                    <Check size={15} color={colors.brand} strokeWidth={2.6} />
                  ) : null}
                </Pressable>
              );
            },
          )}
        </View>
      </AlenioBottomSheet>

      <Modal
        visible={Boolean(preview)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreview(null)}
      >
        <SafeAreaView
          style={styles.previewScreen}
          edges={[]}
          testID="check-in-template-preview"
        >
          <LinearGradient
            pointerEvents="none"
            colors={["#E6DCFF", "#F4F0FF", "#F7F5FC"]}
            locations={[0, 0.42, 1]}
            style={styles.headerWash}
          />
          <View style={[styles.previewTop, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => setPreview(null)}
              hitSlop={10}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              testID="close-check-in-template-preview"
            >
              <X size={18} color="#172033" strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.previewEyebrow}>Preview</Text>
            <View style={styles.previewTopSpacer} />
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.previewContent,
              { paddingBottom: insets.bottom + 28 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.previewTitle}>{preview?.title}</Text>
            {preview?.description ? (
              <Text style={styles.previewDescription}>{preview.description}</Text>
            ) : null}
            {preview ? (
              <Text style={styles.previewCount}>
                {countTemplateQuestions(preview.fields)} question
                {countTemplateQuestions(preview.fields) === 1 ? "" : "s"}
              </Text>
            ) : null}

            {preview?.leaderPrep?.length ? (
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionTitle}>Leader prep</Text>
                {preview.leaderPrep.map((item, index) => (
                  <Text key={`${item}-${index}`} style={styles.previewPrepItem}>
                    {index + 1}. {item}
                  </Text>
                ))}
              </View>
            ) : null}

            {preview
              ? fieldsToTemplateSections(preview.fields).map((section) => (
                  <View key={section.id} style={styles.previewSection}>
                    <Text style={styles.previewSectionTitle}>{section.title}</Text>
                    {section.questions.map((question, index) => (
                      <View key={question.id} style={styles.previewQuestion}>
                        <View style={styles.previewNumber}>
                          <Text style={styles.previewNumberText}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.previewQuestionLabel}>
                            {question.label}
                            {question.required ? (
                              <Text style={{ color: "#EF4444" }}> *</Text>
                            ) : null}
                          </Text>
                          {question.helpText.trim() ? (
                            <Text style={styles.previewHelp}>
                              {question.helpText.trim()}
                            </Text>
                          ) : null}
                          <View style={styles.previewAnswer}>
                            <Text style={styles.previewAnswerText}>
                              {previewAnswerHint(question.type, question.ratingMax)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={Boolean(deleteTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteTarget(null);
          setDeleteBlock(null);
        }}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => {
            setDeleteTarget(null);
            setDeleteBlock(null);
          }}
        >
          <Pressable
            style={styles.confirmCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={deleteBlock ? styles.protectedIcon : styles.dangerIcon}
            >
              {deleteBlock ? (
                <LockKeyhole size={19} color="#5545D9" strokeWidth={2.2} />
              ) : (
                <Trash2 size={20} color="#EF4444" />
              )}
            </View>
            <Text style={styles.confirmTitle}>
              {deleteBlock ? "Template protected" : "Delete this template?"}
            </Text>
            <Text style={styles.confirmBody}>
              {deleteBlock
                ? "Alenio kept this template in place because it’s connected to your workspace process."
                : `“${deleteTarget?.title}” will no longer be available for new check-ins. Existing history stays intact.`}
            </Text>
            {deleteBlock ? (
              <View style={styles.deleteReason}>
                <View style={styles.deleteReasonIcon}>
                  <CircleAlert size={14} color="#5545D9" strokeWidth={2.2} />
                </View>
                <View style={styles.deleteReasonCopy}>
                  <Text style={styles.deleteReasonTitle}>
                    {deleteBlock.title}
                  </Text>
                  <Text style={styles.deleteReasonBody}>
                    {deleteBlock.message}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => {
                  setDeleteTarget(null);
                  setDeleteBlock(null);
                }}
                style={[
                  styles.cancelButton,
                  deleteBlock?.blocked ? styles.protectedCloseButton : null,
                ]}
                testID="cancel-delete-check-in-template"
              >
                <Text
                  style={[
                    styles.cancelButtonText,
                    deleteBlock?.blocked
                      ? styles.protectedCloseButtonText
                      : null,
                  ]}
                >
                  {deleteBlock?.blocked ? "Got it" : "Keep it"}
                </Text>
              </Pressable>
              {!deleteBlock?.blocked ? (
                <Pressable
                  onPress={() =>
                    deleteTarget
                      ? deleteMutation.mutate(deleteTarget.id)
                      : undefined
                  }
                  disabled={deleteMutation.isPending}
                  style={styles.confirmDeleteButton}
                  testID="confirm-delete-check-in-template"
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {deleteBlock ? "Try again" : "Delete"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F5FC" },
  headerWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  topBar: {
    minHeight: 82,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "transparent",
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerAddAction: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172033",
  },
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  topTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#172033",
    letterSpacing: -0.25,
  },
  topSubtitle: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "600",
    color: "#8A96A8",
  },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 13 },
  center: {
    flex: 1,
    padding: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateBody: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    textAlign: "center",
  },
  stateIcon: {
    width: 50,
    height: 50,
    marginBottom: 2,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0ECFF",
  },
  stateIconError: {
    backgroundColor: "#FFF0F0",
  },
  tabs: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: "#EEF1F4",
  },
  tab: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  tabSelected: {
    backgroundColor: "#1B2430",
  },
  tabLabel: { fontSize: 13, fontWeight: "700", color: "#6B728C" },
  tabLabelSelected: { color: "#FFFFFF" },
  libraryIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  libraryTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#17142B",
  },
  librarySubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#7A8496",
  },
  libraryArt: {
    width: 72,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryArtBlob: {
    position: "absolute",
    right: 2,
    top: 4,
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "#E4D9FF",
  },
  libraryArtCard: {
    width: 54,
    height: 42,
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: "space-between",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#6D4AFF",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  libraryArtRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  libraryArtBox: {
    width: 8,
    height: 8,
    borderRadius: 3,
    backgroundColor: "#EDE9FE",
  },
  libraryArtBoxDone: { backgroundColor: "#C4B5FD" },
  libraryArtLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#EDE9FE",
  },
  categoryRow: { gap: 8, paddingRight: 4 },
  categoryChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E6E2F2",
    backgroundColor: "#FFFFFF",
  },
  categoryChipSelected: {
    borderColor: "#6D4AFF",
    backgroundColor: "#6D4AFF",
  },
  categoryChipText: { fontSize: 13, fontWeight: "700", color: "#3F4658" },
  categoryChipTextSelected: { color: "#FFFFFF" },
  categoryAllDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6D4AFF",
  },
  categoryAllDotSelected: { backgroundColor: "#FFFFFF" },
  libraryCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEEAF6",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2A2158",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  libraryCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  libraryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryCardTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    color: "#17142B",
  },
  libraryCardMeta: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#8B95A8",
  },
  libraryCardBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  libraryCardDescription: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  addTemplate: {
    minHeight: 28,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#6D4AFF",
  },
  addTemplateInner: { flexDirection: "row", alignItems: "center", gap: 3 },
  addTemplateDone: { backgroundColor: "#F1FBF6" },
  addTemplateText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  addTemplateTextDone: { color: "#0F9D6E" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchField: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E5E9F0",
    backgroundColor: "#FFFFFF",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 12,
    color: "#172036",
  },
  sortButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E5E9F0",
    backgroundColor: "#FFFFFF",
  },
  sortButtonText: { fontSize: 11.5, fontWeight: "700", color: "#475569" },
  sortOption: {
    minHeight: 42,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E9EDF3",
    backgroundColor: "#FFFFFF",
  },
  sortOptionSelected: { borderColor: "#D7CDFF", backgroundColor: "#F7F5FF" },
  sortOptionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  sortOptionTextSelected: { fontWeight: "800", color: "#241C4F" },
  chipRow: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#F1EDFF",
  },
  chipRequired: { backgroundColor: "#E7F8F1" },
  chipText: { fontSize: 9, fontWeight: "800", color: "#6547E8" },
  chipTextRequired: { color: "#0F7A57" },
  addAction: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: colors.brand,
  },
  addActionDone: {
    backgroundColor: "#F1FBF6",
    borderWidth: 1,
    borderColor: "#CFEEE0",
  },
  addActionText: { fontSize: 11.5, fontWeight: "700", color: "#FFFFFF" },
  addActionTextDone: { color: "#0F7A57" },
  noResults: {
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E7EBF2",
    backgroundColor: "#FBFCFE",
  },
  noResultsTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#10213B",
    textAlign: "center",
  },
  emptyWrap: {
    paddingTop: 28,
    alignItems: "center",
  },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "#E6EAF0",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#10213B",
    textAlign: "center",
  },
  emptyHeadline: {
    marginTop: 18,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#121826",
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 8,
    maxWidth: 280,
    fontSize: 14,
    lineHeight: 20,
    color: "#7B8794",
    textAlign: "center",
  },
  emptyStage: {
    alignSelf: "stretch",
    marginTop: 4,
    paddingTop: 56,
    gap: 10,
  },
  emptyHills: {
    position: "absolute",
    left: -16,
    right: -16,
    top: 0,
    height: 240,
  },
  emptyChoice: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6EBF2",
    backgroundColor: "#FFFFFF",
    shadowColor: "#1B2430",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  emptyChoiceRow: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyChoiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6F8",
  },
  emptyChoiceTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    color: "#171E2B",
  },
  emptyChoiceBody: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 16,
    color: "#8A94A3",
  },
  libraryLink: {
    marginTop: 4,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  libraryLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
  primaryButton: {
    minHeight: 43,
    marginTop: 8,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  primaryButtonText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  card: {
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E9F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#242057",
    shadowOpacity: 0.035,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0ECFF",
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#172036",
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#8290A5",
  },
  cardDescription: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: "#667085",
  },
  cardActions: {
    marginTop: 10,
    paddingTop: 9,
    flexDirection: "row",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E9EDF3",
  },
  secondaryAction: {
    flex: 1,
    minHeight: 32,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E2E5EC",
    backgroundColor: "#FFFFFF",
  },
  secondaryActionText: { fontSize: 11.5, fontWeight: "700", color: "#475569" },
  deleteAction: {
    width: 32,
    height: 32,
    marginLeft: "auto",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#F7DDDD",
    backgroundColor: "#FFF8F8",
  },
  previewScreen: { flex: 1, backgroundColor: "#F7F5FC" },
  previewTop: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewTopSpacer: { width: 34, height: 34 },
  previewEyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B728C",
  },
  previewContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  previewTitle: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#17142B",
  },
  previewDescription: {
    marginTop: -4,
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
  },
  previewCount: {
    marginTop: -4,
    fontSize: 12,
    fontWeight: "700",
    color: "#8B95A8",
  },
  previewSection: {
    padding: 14,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEEAF6",
    backgroundColor: "#FFFFFF",
  },
  previewSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#17142B",
  },
  previewPrepItem: { fontSize: 13, lineHeight: 18, color: "#3F4658" },
  previewQuestion: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  previewNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3EEFF",
  },
  previewNumberText: { fontSize: 12, fontWeight: "800", color: "#6D4AFF" },
  previewQuestionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#17142B",
  },
  previewHelp: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: "#8B95A8",
  },
  previewAnswer: {
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F6F5FA",
  },
  previewAnswerText: { fontSize: 13, color: "#A0A8B8" },
  overlay: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.46)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EEEAF8",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  dangerIcon: {
    width: 42,
    height: 42,
    marginBottom: 12,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  protectedIcon: {
    width: 42,
    height: 42,
    marginBottom: 12,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEDFF",
  },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  confirmBody: { marginTop: 8, fontSize: 13, lineHeight: 19, color: "#64748B" },
  deleteReason: {
    marginTop: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCD8FF",
    backgroundColor: "#F8F7FF",
  },
  deleteReasonIcon: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECE9FF",
  },
  deleteReasonCopy: { flex: 1, minWidth: 0 },
  deleteReasonTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#29224F",
  },
  deleteReasonBody: {
    marginTop: 3,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#69617F",
  },
  confirmActions: { marginTop: 20, flexDirection: "row", gap: 9 },
  cancelButton: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  cancelButtonText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  protectedCloseButton: { backgroundColor: "#5545D9" },
  protectedCloseButtonText: { color: "#FFFFFF" },
  confirmDeleteButton: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EF4444",
  },
});
