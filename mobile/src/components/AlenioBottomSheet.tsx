import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
  useWindowDimensions,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown, X } from "lucide-react-native";
import { fitsFormSheet, useDuoSheetTopClearance } from "@/lib/adaptive-layout";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";
import { SafeKeyboardAvoidingView, SafeKeyboardProvider } from "@/lib/safe-keyboard-controller";

type Props = {
  visible?: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerRight?: React.ReactNode;
  asScreen?: boolean;
  /** When false, the sheet does not shift with the keyboard. Default true. */
  avoidKeyboard?: boolean;
  testID?: string;
  sheetStyle?: StyleProp<ViewStyle>;
  compact?: boolean;
  /** Show an X in the header (useful for form sheets like feedback). */
  showCloseButton?: boolean;
  /** Fraction of window height for scroll body (default 0.58, compact 0.5). */
  bodyHeightRatio?: number;
  /** Optional fixed maximum body height. Takes precedence over bodyHeightRatio. */
  bodyMaxHeight?: number;
  /**
   * Stretch the bottom sheet to its full available height (under the status
   * clearance) instead of hugging content. Profile uses this.
   */
  expandToMax?: boolean;
  /** Show vertical scroll indicator (useful for tall forms). */
  showScrollIndicator?: boolean;
  /** Circle with a down arrow while more of the sheet is below the fold. */
  showMoreIndicator?: boolean;
  /** When false, body does not scroll (content should fit). Default true. */
  scrollEnabled?: boolean;
  /** Optional pull-to-refresh control for scrollable sheet content. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /**
   * Content drawn over the whole sheet, such as a confirmation dialog.
   *
   * iOS refuses to present a second Modal while this one is up, so anything
   * that would otherwise be its own Modal belongs here instead.
   */
  overlay?: React.ReactNode;
};

/**
 * Past this the sheet stops hugging the bottom edge and becomes a centred
 * dialog, which is what iOS and Material both do once the window is wide.
 * Height is in the test so a phone on its side stays a bottom sheet.
 */
function useIsDialogSize() {
  const { width, height } = useWindowDimensions();
  return fitsFormSheet(width, height);
}

function SheetContent({
  title,
  subtitle,
  onClose,
  children,
  footer,
  headerRight,
  testID,
  sheetStyle,
  compact = false,
  showCloseButton = false,
  bodyHeightRatio,
  bodyMaxHeight: bodyMaxHeightOverride,
  expandToMax = false,
  showScrollIndicator = false,
  showMoreIndicator = false,
  scrollEnabled = true,
  refreshControl,
  overlay,
  avoidKeyboard = true,
}: Omit<Props, "visible" | "asScreen">) {
  const insets = useSafeAreaInsets();
  const dialog = useIsDialogSize();
  const topClearance = useDuoSheetTopClearance({ fullScreen: true });
  /** Centred, so it owes nothing to the home indicator at the bottom edge. */
  const bottomPad = dialog
    ? compact
      ? 14
      : 18
    : Math.max(insets.bottom, compact ? 10 : 20) + (compact ? 4 : 12);
  const windowH = Dimensions.get("window").height;
  /** On Duo, stop just under the status dock; otherwise keep the usual ratio. */
  const sheetMaxHeight = dialog
    ? undefined
    : Math.round(windowH - topClearance);
  const ratio =
    bodyHeightRatio ?? (expandToMax ? 1 : compact ? 0.5 : 0.58);
  const headerChrome = compact ? 112 : 140;
  const reservedChrome = headerChrome + bottomPad + (dialog ? 0 : topClearance);
  const bodyMaxHeight =
    bodyMaxHeightOverride ??
    Math.max(
      180,
      Math.min(
        Math.round(windowH * ratio),
        Math.round(windowH - reservedChrome),
        sheetMaxHeight != null
          ? Math.max(160, sheetMaxHeight - headerChrome - bottomPad)
          : Number.POSITIVE_INFINITY,
      ),
    );
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetrics = useRef({ layout: 0, content: 0, offset: 0 });
  const [moreBelow, setMoreBelow] = useState(false);
  const updateMoreBelow = () => {
    const { layout, content, offset } = scrollMetrics.current;
    const next =
      layout > 0 && content > layout + 24 && offset + layout < content - 24;
    setMoreBelow((current) => (current === next ? current : next));
  };
  const scrollToMore = () => {
    const { offset, layout } = scrollMetrics.current;
    scrollRef.current?.scrollTo({
      y: offset + Math.max(140, layout * 0.75),
      animated: true,
    });
  };

  return (
    <View
      style={[styles.backdrop, dialog ? styles.backdropDialog : null]}
      testID={testID}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <SheetKeyboardWrap
        enabled={avoidKeyboard}
        style={[
          styles.avoider,
          dialog ? styles.avoiderDialog : null,
          styles.avoiderFront,
          sheetMaxHeight != null ? { maxHeight: sheetMaxHeight } : null,
        ]}
      >
        {/* View (not Pressable) so ScrollView can receive pan gestures */}
        <View
          style={[
            styles.sheet,
            compact ? styles.sheetCompact : null,
            dialog ? styles.sheetDialog : null,
            {
              paddingBottom: bottomPad,
              ...(sheetMaxHeight != null ? { maxHeight: sheetMaxHeight } : null),
              ...(expandToMax && sheetMaxHeight != null
                ? { height: sheetMaxHeight }
                : null),
            },
            sheetStyle,
          ]}
        >
          {/** A grab handle promises a drag the centred dialog does not do. */}
          {dialog ? null : (
            <View style={[styles.handle, compact ? styles.handleCompact : null]} />
          )}
          <View
            style={[styles.headerRow, compact ? styles.headerRowCompact : null]}
          >
            <Image source={require("@/assets/alenio-icon.png")} style={[styles.logo, compact ? styles.logoCompact : null]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, compact ? styles.titleCompact : null]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null]} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {headerRight}
            {showCloseButton ? (
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeBtn}
                testID="alenio-sheet-close"
              >
                <X size={compact ? 18 : 20} color="#64748B" strokeWidth={2.25} />
              </Pressable>
            ) : null}
          </View>
          {scrollEnabled ? (
            <View
              style={[
                styles.bodyWrap,
                expandToMax
                  ? { flex: 1, minHeight: 0, height: bodyMaxHeight }
                  : { maxHeight: bodyMaxHeight },
              ]}
            >
              <ScrollView
                ref={scrollRef}
                style={[
                  styles.bodyScroll,
                  expandToMax
                    ? { flex: 1, minHeight: 0 }
                    : { maxHeight: bodyMaxHeight },
                ]}
                contentContainerStyle={[
                  styles.bodyContent,
                  compact ? styles.bodyContentCompact : null,
                  expandToMax ? styles.bodyContentFill : styles.bodyContentGrow,
                ]}
                showsVerticalScrollIndicator={showScrollIndicator}
                indicatorStyle="black"
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                removeClippedSubviews={false}
                bounces={showScrollIndicator || !!refreshControl}
                alwaysBounceVertical={showScrollIndicator || !!refreshControl}
                nestedScrollEnabled
                scrollEventThrottle={16}
                refreshControl={refreshControl}
                onLayout={(event) => {
                  scrollMetrics.current.layout = event.nativeEvent.layout.height;
                  updateMoreBelow();
                }}
                onContentSizeChange={(_width, height) => {
                  scrollMetrics.current.content = height;
                  updateMoreBelow();
                }}
                onScroll={(event) => {
                  scrollMetrics.current.offset = event.nativeEvent.contentOffset.y;
                  updateMoreBelow();
                }}
              >
                {children}
              </ScrollView>
              {showMoreIndicator && moreBelow ? (
                <View pointerEvents="box-none" style={styles.moreWrap}>
                  <Pressable
                    onPress={scrollToMore}
                    style={styles.moreButton}
                    accessibilityRole="button"
                    accessibilityLabel="More settings"
                    testID="alenio-sheet-more"
                  >
                    <ChevronDown size={18} color="#172033" strokeWidth={2.4} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View
              style={[
                styles.bodyContent,
                compact ? styles.bodyContentCompact : null,
                { paddingBottom: compact ? 8 : 10, width: "100%", alignSelf: "stretch" },
              ]}
            >
              {children}
            </View>
          )}
          {footer ? <View style={[styles.footer, compact ? styles.footerCompact : null]}>{footer}</View> : null}
        </View>
      </SheetKeyboardWrap>
      {overlay ? (
        <View pointerEvents="box-none" style={styles.overlayHost}>
          {overlay}
        </View>
      ) : null}
    </View>
  );
}

function SheetKeyboardWrap({
  enabled,
  style,
  children,
}: {
  enabled: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return <View style={style}>{children}</View>;
  }
  return (
    <SafeKeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={style}
      keyboardVerticalOffset={0}
    >
      {children}
    </SafeKeyboardAvoidingView>
  );
}

export function AlenioBottomSheet({
  visible = true,
  asScreen = false,
  ...props
}: Props) {
  const dialog = useIsDialogSize();
  if (asScreen) {
    if (!visible) return null;
    // A native modal is its own window. The root keyboard provider does not
    // reach it, so a field can focus without the keyboard ever appearing.
    return (
      <SafeKeyboardProvider>
        <SheetContent {...props} />
      </SafeKeyboardProvider>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      /** Sliding up from an edge the dialog is not attached to reads wrong. */
      animationType={dialog ? "fade" : "slide"}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      /**
       * RN Modal defaults to portrait-only on phone idiom. On an open Duo that
       * collapses the spanned window to one leaf and fights our native
       * orientation rule — the calendar day sheet then flips forever.
       */
      supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
      onRequestClose={props.onClose}
    >
      <SheetContent {...props} />
    </Modal>
  );
}

export function AlenioSheetCard({
  children,
  tint = "blue",
  style,
  compact = false,
}: {
  children: React.ReactNode;
  tint?: "blue" | "purple" | "slate" | "danger";
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const backgroundColor =
    tint === "purple" ? "#F5F3FF" : tint === "slate" ? "#F8FAFC" : tint === "danger" ? "#FEF2F2" : "#EEF2FF";
  return <View style={[styles.card, compact ? styles.cardCompact : null, { backgroundColor }, style]}>{children}</View>;
}

export function AlenioSheetIcon({
  children,
  color = "#4361EE",
  compact = false,
}: {
  children: React.ReactNode;
  color?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.iconCircle, compact ? styles.iconCircleCompact : null, { backgroundColor: color }]}>
      {children}
    </View>
  );
}

export function AlenioSheetOption({
  icon,
  iconColor = "#4361EE",
  title,
  subtitle,
  onPress,
  destructive = false,
  compact = true,
  tint,
  testID,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  compact?: boolean;
  tint?: "blue" | "purple" | "slate" | "danger";
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button">
      <AlenioSheetCard
        tint={destructive ? "danger" : tint ?? "blue"}
        compact={compact}
      >
        <View style={[alenioSheetStyles.optionRow, compact ? alenioSheetStyles.optionRowCompact : null]}>
          <AlenioSheetIcon color={destructive ? "#EF4444" : iconColor} compact={compact}>
            {icon}
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[
                alenioSheetStyles.optionTitle,
                compact ? alenioSheetStyles.optionTitleCompact : null,
                destructive ? { color: "#DC2626" } : null,
              ]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  alenioSheetStyles.optionSubtitle,
                  compact ? alenioSheetStyles.optionSubtitleCompact : null,
                  destructive ? { color: "#F87171" } : null,
                ]}
                numberOfLines={compact ? 1 : 2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </AlenioSheetCard>
    </Pressable>
  );
}

export const alenioSheetStyles = StyleSheet.create({
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  optionRowCompact: {
    gap: 8,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  optionTitleCompact: {
    fontSize: 13,
  },
  optionSubtitle: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
    lineHeight: 15,
  },
  optionSubtitleCompact: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#0F172A",
  },
  primaryButton: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#4361EE",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
    lineHeight: 16,
  },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  backdropDialog: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  avoider: {
    width: "100%",
    maxHeight: "92%",
    justifyContent: "flex-end",
  },
  avoiderDialog: {
    maxHeight: "88%",
    alignItems: "center",
    justifyContent: "center",
  },
  avoiderFront: {
    zIndex: 2,
    elevation: 24,
  },
  /** Above the sheet, and out of the layout so the card does not shift. */
  overlayHost: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
    elevation: 32,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: "100%",
    flexGrow: 0,
  },
  sheetCompact: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  /** Listed after the compact styles so it wins the corner radii. */
  sheetDialog: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 18,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 12,
  },
  handleCompact: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  headerRowCompact: {
    gap: 8,
    marginBottom: 0,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginLeft: 4,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  logoCompact: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  titleCompact: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
    lineHeight: 15,
  },
  subtitleCompact: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 14,
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyWrap: {
    position: "relative",
    flexGrow: 0,
    flexShrink: 1,
  },
  moreWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: "center",
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E1F5",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  bodyContent: {
    gap: 8,
    paddingTop: 10,
    paddingBottom: 12,
  },
  bodyContentCompact: {
    gap: 6,
    paddingTop: 8,
    paddingBottom: 10,
  },
  bodyContentGrow: {
    flexGrow: 0,
  },
  bodyContentFill: {
    flexGrow: 1,
  },
  footer: {
    gap: 2,
    paddingTop: 10,
  },
  footerCompact: {
    gap: 2,
    paddingTop: 6,
  },
  card: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    overflow: "visible" as const,
  },
  cardCompact: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconCircleCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
});
