import type { ReactNode } from "react";
import type { DiscoverNode } from "../../lib/discover-public-api";
import type { DiscoverCalloutAttrs, DiscoverCardGridAttrs, DiscoverChecklistAttrs } from "../../lib/discover-blocks";
import { DiscoverCallout, DiscoverCardGrid, DiscoverChecklist } from "./DiscoverDesignedBlocks";

function isSafeHttpsUrl(value: string | undefined | null): value is string {
  return Boolean(value && /^https:\/\//i.test(value));
}

function Inline({ nodes }: { nodes?: DiscoverNode[] }) {
  if (!nodes?.length) return null;
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "hardBreak") return <br key={index} />;
        if (node.type !== "text" || !node.text) return null;
        const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
        let content: ReactNode = node.text;
        if (node.marks?.some((mark) => mark.type === "bold")) content = <strong>{content}</strong>;
        if (node.marks?.some((mark) => mark.type === "italic")) content = <em>{content}</em>;
        if (isSafeHttpsUrl(href)) {
          return (
            <a key={index} href={href} target="_blank" rel="noreferrer noopener">
              {content}
            </a>
          );
        }
        return <span key={index}>{content}</span>;
      })}
    </>
  );
}

const TEXT_TYPES = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote"]);

function widthOf(block: DiscoverNode): string | null {
  const width = block.attrs?.width;
  return width === "2/3" || width === "1/2" || width === "1/3" ? width : null;
}

/** Older articles used "beside text above" before blocks had their own widths. */
function isSidePanel(block: DiscoverNode) {
  return (
    (block.type === "discoverCallout" || block.type === "discoverChecklist") &&
    block.attrs?.layout === "side" &&
    !widthOf(block)
  );
}

type Segment = { block: DiscoverNode } | { text: DiscoverNode[]; panel: DiscoverNode };

/** A side panel sits beside the text written just above it, like a magazine sidebar. */
function segment(blocks: DiscoverNode[]): Segment[] {
  const out: Segment[] = [];
  let run: DiscoverNode[] = [];
  const flush = () => {
    for (const block of run) out.push({ block });
    run = [];
  };
  for (const block of blocks) {
    if (TEXT_TYPES.has(block.type ?? "") && !widthOf(block)) {
      run.push(block);
      continue;
    }
    if (isSidePanel(block) && run.length > 0) {
      out.push({ text: run, panel: block });
      run = [];
      continue;
    }
    flush();
    out.push({ block });
  }
  flush();
  return out;
}

function Block({ block }: { block: DiscoverNode }) {
  if (block.type === "heading") {
    return block.attrs?.level === 3 ? (
      <h3>
        <Inline nodes={block.content} />
      </h3>
    ) : (
      <h2>
        <Inline nodes={block.content} />
      </h2>
    );
  }
  if (block.type === "bulletList" || block.type === "orderedList") {
    const items = (block.content ?? []).map((item, itemIndex) => (
      <li key={itemIndex}>
        {(item.content ?? []).map((paragraph, paragraphIndex) => (
          <Inline key={paragraphIndex} nodes={paragraph.content} />
        ))}
      </li>
    ));
    return block.type === "orderedList" ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  if (block.type === "blockquote") {
    return (
      <blockquote>
        {(block.content ?? []).map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex}>
            <Inline nodes={paragraph.content} />
          </p>
        ))}
      </blockquote>
    );
  }
  if (block.type === "image") {
    const src = block.attrs?.src;
    if (!isSafeHttpsUrl(src)) return null;
    return <img src={src} alt={block.attrs?.alt ?? ""} loading="lazy" />;
  }
  if (block.type === "discoverCallout") return <DiscoverCallout attrs={(block.attrs ?? {}) as Partial<DiscoverCalloutAttrs>} />;
  if (block.type === "discoverCards") return <DiscoverCardGrid attrs={(block.attrs ?? {}) as Partial<DiscoverCardGridAttrs>} />;
  if (block.type === "discoverChecklist") return <DiscoverChecklist attrs={(block.attrs ?? {}) as Partial<DiscoverChecklistAttrs>} />;
  if (block.type !== "paragraph") return null;
  return (
    <p>
      <Inline nodes={block.content} />
    </p>
  );
}

export function DiscoverArticleBody({ blocks }: { blocks: DiscoverNode[] }) {
  return (
    <div className="dread-body ddoc-body">
      {segment(blocks).map((part, index) =>
        "panel" in part ? (
          <div key={index} className="ddoc-split">
            <div className="ddoc-split-text">
              {part.text.map((block, blockIndex) => (
                <Block key={blockIndex} block={block} />
              ))}
            </div>
            <div className="ddoc-split-panel">
              <Block block={part.panel} />
            </div>
          </div>
        ) : widthOf(part.block) ? (
          <div key={index} className="ddoc-cell" data-width={widthOf(part.block)!}>
            <Block block={part.block} />
          </div>
        ) : (
          <Block key={index} block={part.block} />
        ),
      )}
    </div>
  );
}
