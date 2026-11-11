import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Search, X } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { colors } from "@/theme";

export type EventStockPhoto = {
  id: string;
  title: string;
  thumbUrl: string;
  url: string;
};

const SUGGESTIONS = ["Team", "Office", "Celebration", "Meeting", "Outdoors"];
const DEFAULT_QUERY = "Office";
const WINDOW_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = Math.round(WINDOW_HEIGHT * 0.68);

type Props = {
  visible: boolean;
  initialQuery?: string;
  bottomInset: number;
  onClose: () => void;
  onSelect: (photo: EventStockPhoto) => void;
};

export function EventStockPhotoSearch({
  visible,
  initialQuery = "",
  bottomInset,
  onClose,
  onSelect,
}: Props) {
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim() || DEFAULT_QUERY);
  const [photos, setPhotos] = useState<EventStockPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  const sheetHeight = Math.min(
    SHEET_HEIGHT,
    Math.max(300, WINDOW_HEIGHT - keyboardHeight - 8),
  );

  useEffect(() => {
    if (!visible) return;
    const next = initialQuery.trim() || DEFAULT_QUERY;
    setDraft(next);
    setQuery(next);
  }, [visible, initialQuery]);

  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => {
      const next = draft.trim();
      setQuery(next.length >= 2 ? next : DEFAULT_QUERY);
    }, 350);
    return () => clearTimeout(handle);
  }, [draft, visible]);

  useEffect(() => {
    if (!visible) return;
    if (query.length < 2) {
      setPhotos([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ photos: EventStockPhoto[] }>(
        `/api/stock-photos?q=${encodeURIComponent(query)}`,
      )
      .then((data) => {
        if (cancelled) return;
        setPhotos(data.photos ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhotos([]);
        setError(
          err instanceof Error ? err.message : "Could not search photos.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, visible]);

  const emptyHint = useMemo(() => {
    if (loading) return null;
    if (error) return error;
    if (photos.length === 0)
      return "No free photos matched that search. Try another word.";
    return null;
  }, [error, loading, photos.length]);

  if (!visible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: "flex-end",
        zIndex: 34,
      }}
    >
      <Pressable
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      />
      <View
        style={{
          backgroundColor: "white",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: keyboardHeight > 0 ? 8 : bottomInset + 12,
          paddingHorizontal: 16,
          height: sheetHeight,
          marginBottom: keyboardHeight,
        }}
      >
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#E2E8F0",
            alignSelf: "center",
            marginTop: 10,
            marginBottom: 12,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>
              Free photos
            </Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>
              Public photos you can use on this event
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Close photo search"
          >
            <X size={18} color="#94A3B8" strokeWidth={2.2} />
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#F4F6FB",
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 42,
          }}
        >
          <Search size={16} color={colors.brand} strokeWidth={2.2} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Try waterfall, office, birthday"
            placeholderTextColor="#A8B3C7"
            returnKeyType="search"
            style={{
              flex: 1,
              fontSize: 15,
              color: "#0F172A",
              paddingVertical: 0,
            }}
            testID="event-stock-photo-search"
          />
        </View>
        <View style={{ height: 44, marginTop: 8, marginBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              alignItems: "center",
              gap: 8,
              paddingRight: 8,
            }}
          >
            {SUGGESTIONS.map((label) => {
              const selected = query.toLowerCase() === label.toLowerCase();
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    setDraft(label);
                    setQuery(label);
                  }}
                  style={{
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: selected ? "#EEF1FF" : "#F4F6FB",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: selected ? "#6d28d9" : "#64748B",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        {loading ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator color="#6d28d9" />
          </View>
        ) : emptyHint ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: "#64748B",
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {emptyHint}
            </Text>
          </View>
        ) : (
          <ScrollView
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              paddingBottom: 8,
            }}
          >
            {photos.map((photo) => (
              <Pressable
                key={photo.id}
                onPress={() => onSelect(photo)}
                accessibilityRole="button"
                accessibilityLabel={`Use photo ${photo.title}`}
                style={{
                  width: "31.5%",
                  aspectRatio: 1,
                  borderRadius: 10,
                  overflow: "hidden",
                  backgroundColor: "#EEF1FF",
                }}
              >
                <Image
                  source={{ uri: photo.thumbUrl }}
                  style={{ width: "100%", height: "100%" }}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
