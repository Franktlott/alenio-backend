import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Building2, Check, ChevronDown, ChevronRight, Layers, Search } from "lucide-react-native";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { formatTeamRole } from "@/components/WorkspaceTeamUI";
import {
  filterSharedWorkspaces,
  formatWorkspaceSince,
  SHARED_WORKSPACE_SORT_LABELS,
  sortSharedWorkspaces,
  WORKSPACE_TILE_TINTS,
  workspaceTileInitials,
  workspaceTileTint,
  type SharedWorkspaceSort,
} from "@/lib/shared-workspace-display";
import type { PublicProfileWorkspace } from "@/lib/types";
import { colors, typography } from "@/theme";

const BRAND = colors.brand;
/** Soft card fills paired with WORKSPACE_TILE_TINTS, in the same order. */
const CARD_SURFACES = [
  { background: "#EEF2FF", ink: "#4361EE" },
  { background: "#F3E8FF", ink: "#7C3AED" },
  { background: "#E7F8F4", ink: "#0E9F8C" },
  { background: "#FDECEC", ink: "#E8433F" },
  { background: "#FFF4E8", ink: "#C2410C" },
  { background: "#E8F1FF", ink: "#2563C9" },
  { background: "#F6E9FB", ink: "#9333A8" },
  { background: "#E6F6F4", ink: "#0F766E" },
] as const;

type Props = {
  workspaces: PublicProfileWorkspace[];
  /** First name of the profile owner, for the sheet subtitle. */
  personName: string;
  onOpenWorkspace: (workspace: PublicProfileWorkspace) => void;
  /** Increment to open the full list from the stat card. */
  openSignal?: number;
  /** Keep the list sheet without the large section on the profile. */
  sheetOnly?: boolean;
};

function cardSurface(id: string) {
  const tile = workspaceTileTint(id);
  const index = WORKSPACE_TILE_TINTS.findIndex((item) => item.background === tile.background);
  return CARD_SURFACES[index] ?? CARD_SURFACES[0];
}

function WorkspaceTile({
  workspace,
  large = false,
}: {
  workspace: PublicProfileWorkspace;
  large?: boolean;
}) {
  const tint = workspaceTileTint(workspace.id);
  return (
    <View
      style={[
        styles.tile,
        large ? styles.tileLarge : null,
        { backgroundColor: tint.background },
      ]}
    >
      <Text
        style={[
          styles.tileLabel,
          large ? styles.tileLabelLarge : null,
          { color: tint.label },
        ]}
      >
        {workspaceTileInitials(workspace.name)}
      </Text>
    </View>
  );
}

function WorkspaceRow({
  workspace,
  divider,
  onPress,
}: {
  workspace: PublicProfileWorkspace;
  divider: boolean;
  onPress: () => void;
}) {
  const since = formatWorkspaceSince(workspace.joinedAt);
  const role = formatTeamRole(workspace.role) || "Member";
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, divider ? styles.rowDivider : null]}
      accessibilityRole="button"
      accessibilityLabel={`${workspace.name}, ${role}${since ? `, shared since ${since}` : ""}`}
      testID={`shared-workspace-${workspace.id}`}
    >
      <WorkspaceTile workspace={workspace} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowName} numberOfLines={1}>
          {workspace.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {since ? `${role} · Shared since ${since}` : role}
        </Text>
      </View>
      <ChevronRight size={14} color="#B3BCC9" strokeWidth={2.2} />
    </Pressable>
  );
}

function WorkspacePreviewCard({
  workspace,
  onPress,
}: {
  workspace: PublicProfileWorkspace;
  onPress: () => void;
}) {
  const surface = cardSurface(workspace.id);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.preview, { backgroundColor: surface.background }]}
      accessibilityRole="button"
      accessibilityLabel={`${workspace.name}, workspace`}
      testID={`shared-workspace-${workspace.id}`}
    >
      <Text style={[styles.previewInitials, { color: surface.ink }]}>
        {workspaceTileInitials(workspace.name)}
      </Text>
      <Text style={styles.previewName} numberOfLines={2}>
        {workspace.name}
      </Text>
      <View style={styles.previewFoot}>
        <Text style={styles.previewKind}>Workspace</Text>
        <ChevronRight size={16} color="#98A2B3" strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

export function SharedWorkspacesSection({
  workspaces,
  personName,
  onOpenWorkspace,
  openSignal = 0,
  sheetOnly = false,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SharedWorkspaceSort>("recent");
  const [sortOpen, setSortOpen] = useState(false);

  const ordered = useMemo(
    () => sortSharedWorkspaces(workspaces, "recent"),
    [workspaces],
  );

  const sheetRows = useMemo(
    () => sortSharedWorkspaces(filterSharedWorkspaces(workspaces, search), sort),
    [search, sort, workspaces],
  );
  const firstName = personName.trim().split(/\s+/)[0] || "them";
  const seenSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal === seenSignal.current) return;
    seenSignal.current = openSignal;
    if (openSignal > 0 && workspaces.length > 0) setSheetOpen(true);
  }, [openSignal, workspaces.length]);
  const preview = ordered.slice(0, 2);

  const openWorkspace = (workspace: PublicProfileWorkspace) => {
    setSheetOpen(false);
    onOpenWorkspace(workspace);
  };

  const sheet = (
      <AlenioBottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Shared workspaces"
        subtitle={`${workspaces.length} ${workspaces.length === 1 ? "workspace" : "workspaces"} you share with ${firstName}`}
        compact
        bodyHeightRatio={0.52}
        showScrollIndicator={sheetRows.length > 5}
        testID="shared-workspaces-sheet"
        headerRight={
          <Pressable
            onPress={() => setSortOpen((open) => !open)}
            hitSlop={8}
            style={styles.sortControl}
            accessibilityRole="button"
            accessibilityLabel={`Sort workspaces, currently ${SHARED_WORKSPACE_SORT_LABELS[sort]}`}
            testID="shared-workspaces-sort"
          >
            <Text style={styles.sortLabel}>Sort</Text>
            <ChevronDown size={13} color="#64748B" strokeWidth={2.4} />
          </Pressable>
        }
      >
        {sortOpen ? (
          <View style={styles.sortMenu}>
            {(["recent", "name"] as const).map((option) => {
              const selected = sort === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setSort(option);
                    setSortOpen(false);
                  }}
                  style={styles.sortOption}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`shared-workspaces-sort-${option}`}
                >
                  <Text
                    style={selected ? styles.sortOptionSelected : styles.sortOptionLabel}
                  >
                    {SHARED_WORKSPACE_SORT_LABELS[option]}
                  </Text>
                  {selected ? <Check size={15} color={BRAND} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.searchField}>
          <Search size={15} color="#94A3B8" strokeWidth={2.2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search workspaces..."
            placeholderTextColor="#98A2B3"
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            testID="shared-workspaces-search"
          />
        </View>

        {sheetRows.length === 0 ? (
          <Text style={styles.noResults}>No workspaces match that search.</Text>
        ) : (
          <ScrollView
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {sheetRows.map((workspace, index) => (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                divider={index > 0}
                onPress={() => openWorkspace(workspace)}
              />
            ))}
          </ScrollView>
        )}
      </AlenioBottomSheet>
  );

  if (sheetOnly) return sheet;

  return (
    <View style={styles.section} testID="shared-workspaces-section">
      <View style={styles.header}>
        <Layers size={16} color="#111A2B" strokeWidth={2.2} />
        <Text style={styles.headerTitle}>Shared workspaces</Text>
        <View style={styles.headerSpacer} />
        {workspaces.length > 0 ? (
          <Pressable
            onPress={() => setSheetOpen(true)}
            hitSlop={8}
            style={styles.viewAll}
            accessibilityRole="button"
            accessibilityLabel={`View all ${workspaces.length} shared workspaces`}
            testID="shared-workspaces-view-all"
          >
            <Text style={styles.viewAllLabel}>View all</Text>
          </Pressable>
        ) : null}
      </View>

      {workspaces.length === 0 ? (
        <View style={styles.card}>
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Building2 size={15} color="#8794A8" strokeWidth={2} />
            </View>
            <Text style={styles.emptyCopy}>You do not share a workspace yet.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.previewRow}>
          {preview.map((workspace) => (
            <WorkspacePreviewCard
              key={workspace.id}
              workspace={workspace}
              onPress={() => onOpenWorkspace(workspace)}
            />
          ))}
        </View>
      )}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headerTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#111A2B",
  },
  countPill: {
    minWidth: 17,
    paddingHorizontal: 5,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  countLabel: {
    ...typography.metaTiny,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: "#5B6879",
  },
  headerSpacer: { flex: 1 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 1 },
  viewAllLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: BRAND,
  },
  previewRow: { flexDirection: "row", gap: 10 },
  preview: {
    flex: 1,
    minHeight: 118,
    padding: 12,
    borderRadius: 18,
    justifyContent: "space-between",
  },
  previewInitials: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  previewName: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#111A2B",
  },
  previewFoot: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewKind: { fontSize: 12, lineHeight: 16, color: "#667085" },
  card: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  tile: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLarge: { width: 56, height: 56, borderRadius: 17 },
  tileLabel: {
    ...typography.sectionSubtitle,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  tileLabelLarge: { fontSize: 17, lineHeight: 21 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowName: {
    ...typography.sectionSubtitle,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: "#101828",
  },
  rowMeta: {
    ...typography.metaTiny,
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 13,
    color: "#7A869A",
  },
  empty: { flexDirection: "row", alignItems: "center", gap: 9, padding: 11 },
  emptyIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  emptyCopy: {
    ...typography.metaTiny,
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: "#69758C",
  },
  sortControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E7EAF3",
    backgroundColor: "#FFFFFF",
  },
  sortLabel: {
    ...typography.sectionSubtitle,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#475569",
  },
  sortMenu: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#ECEFF5",
    backgroundColor: "#FBFCFF",
    paddingHorizontal: 10,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
  },
  sortOptionLabel: {
    ...typography.sectionSubtitle,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#475569",
  },
  sortOptionSelected: {
    ...typography.sectionSubtitle,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: BRAND,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: {
    ...typography.sectionSubtitle,
    flex: 1,
    padding: 0,
    fontSize: 13.5,
    fontWeight: "500",
    color: "#0F172A",
  },
  sheetList: { flexGrow: 0 },
  noResults: {
    ...typography.metaTiny,
    paddingVertical: 22,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    color: "#7C8798",
  },
});
