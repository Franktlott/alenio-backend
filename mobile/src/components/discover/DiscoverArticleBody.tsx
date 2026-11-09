import { Image, Linking, Text, View } from "react-native";
import type { DiscoverNode } from "@/lib/discover";
import { DiscoverCallout, DiscoverCardGrid, DiscoverChecklist } from "./DiscoverDesignedBlocks";

function Inline({ nodes }: { nodes?: DiscoverNode[] }) {
  if (!nodes?.length) return null;
  return (
    <Text>
      {nodes.map((node, index) => {
        if (node.type === "hardBreak") return "\n";
        if (node.type !== "text" || !node.text) return null;
        const link = node.marks?.find((mark) => mark.type === "link");
        const href = link?.attrs?.href;
        const safe = href && /^https:\/\//i.test(href) ? href : null;
        let style: { fontWeight?: "700"; fontStyle?: "italic" } = {};
        if (node.marks?.some((mark) => mark.type === "bold")) style = { ...style, fontWeight: "700" };
        if (node.marks?.some((mark) => mark.type === "italic")) style = { ...style, fontStyle: "italic" };
        if (safe) {
          return (
            <Text
              key={index}
              style={{ ...style, color: "#6D5EF8" }}
              onPress={() => void Linking.openURL(safe)}
            >
              {node.text}
            </Text>
          );
        }
        return (
          <Text key={index} style={style}>
            {node.text}
          </Text>
        );
      })}
    </Text>
  );
}

export function DiscoverArticleBody({ blocks }: { blocks: DiscoverNode[] }) {
  return (
    <View>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const level = block.attrs?.level === 3 ? 3 : 2;
          return (
            <Text
              key={index}
              style={{
                marginTop: 16,
                marginBottom: 6,
                fontSize: level === 2 ? 22 : 18,
                lineHeight: level === 2 ? 28 : 24,
                fontWeight: "800",
                color: "#111A2B",
              }}
            >
              <Inline nodes={block.content} />
            </Text>
          );
        }
        if (block.type === "bulletList" || block.type === "orderedList") {
          return (
            <View key={index} style={{ marginVertical: 6, gap: 6 }}>
              {(block.content ?? []).map((item, itemIndex) => (
                <Text key={itemIndex} style={{ fontSize: 16, lineHeight: 24, color: "#1F2937" }}>
                  {block.type === "orderedList" ? `${itemIndex + 1}. ` : "• "}
                  {(item.content ?? []).map((paragraph, paragraphIndex) => (
                    <Inline key={paragraphIndex} nodes={paragraph.content} />
                  ))}
                </Text>
              ))}
            </View>
          );
        }
        if (block.type === "blockquote") {
          return (
            <View
              key={index}
              style={{
                marginVertical: 14,
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: 14,
                borderRadius: 16,
                backgroundColor: "#F4F0FF",
              }}
            >
              <Text style={{ fontSize: 28, lineHeight: 28, color: "#C4B5FD", fontWeight: "700" }}>"</Text>
              {(block.content ?? []).map((paragraph, paragraphIndex) => (
                <Text key={paragraphIndex} style={{ fontSize: 16, lineHeight: 24, color: "#3F3D56", fontWeight: "600" }}>
                  <Inline nodes={paragraph.content} />
                </Text>
              ))}
            </View>
          );
        }
        if (block.type === "image") {
          const src = block.attrs?.src;
          if (!src || !/^https:\/\//i.test(src)) return null;
          return (
            <Image
              key={index}
              source={{ uri: src }}
              accessibilityLabel={block.attrs?.alt ?? ""}
              style={{ width: "100%", height: 180, borderRadius: 12, marginVertical: 10 }}
              resizeMode="cover"
            />
          );
        }
        if (block.type === "discoverCallout") return <DiscoverCallout key={index} attrs={block.attrs ?? {}} />;
        if (block.type === "discoverCards") return <DiscoverCardGrid key={index} attrs={block.attrs ?? {}} />;
        if (block.type === "discoverChecklist") return <DiscoverChecklist key={index} attrs={block.attrs ?? {}} />;
        if (block.type !== "paragraph") return null;
        return (
          <Text key={index} style={{ marginTop: 8, fontSize: 16, lineHeight: 24, color: "#1F2937" }}>
            <Inline nodes={block.content} />
          </Text>
        );
      })}
    </View>
  );
}
