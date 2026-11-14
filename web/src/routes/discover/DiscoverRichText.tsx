import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  ChevronDown,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  MessageSquareText,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  Video,
} from "lucide-react";
import { TextSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { uploadDiscoverMedia } from "../../lib/api";
import {
  DEFAULT_CALLOUT,
  DEFAULT_CARDS,
  DEFAULT_CHECKLIST,
  DEFAULT_YOUTUBE,
  FRAMEWORK_TEMPLATE,
  parseYoutubeVideoId,
} from "../../lib/discover-blocks";
import { DiscoverBlockHandles } from "./DiscoverBlockHandles";
import {
  BlockWidth,
  DiscoverCalloutNode,
  DiscoverCardsNode,
  DiscoverChecklistNode,
  DiscoverYoutubeNode,
} from "./DiscoverBlockNodes";

type Tool = {
  label: string;
  text?: string;
  icon: ReactNode;
  className?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

const column = (width: string) => ({ type: "paragraph", attrs: { width } });

const LAYOUTS = [
  { id: "two", label: "Two columns", hint: "Side-by-side text", content: () => [column("1/2"), column("1/2")] },
  { id: "three", label: "Three columns", hint: "Three equal text columns", content: () => [column("1/3"), column("1/3"), column("1/3")] },
  {
    id: "sidebar",
    label: "Text + callout",
    hint: "Text with a callout beside it",
    content: () => [column("2/3"), { type: "discoverCallout", attrs: { ...structuredClone(DEFAULT_CALLOUT), width: "1/3" } }],
  },
  { id: "sample", label: "Sample framework page", hint: "A full example article to edit", content: () => FRAMEWORK_TEMPLATE },
] as const;

type Props = {
  value: object;
  onChange: (json: object) => void;
};

export function DiscoverRichText({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false, autolink: false, protocols: ["https"] }),
      Image,
      DiscoverCalloutNode,
      DiscoverCardsNode,
      DiscoverChecklistNode,
      DiscoverYoutubeNode,
      BlockWidth,
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: ({ editor: current, node }) =>
          current.isEmpty ? "Write the article…" : node.type.name === "paragraph" && node.attrs.width ? "Type here…" : "",
      }),
    ],
    content: value,
    // Keeps the toolbar's pressed states in step with the cursor.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  });

  const run = (command: () => boolean) => {
    command();
  };

  const addLink = () => {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Link address (https://)", current ?? "https://");
    if (next == null) return;
    if (!next.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^https:\/\/\S+$/i.test(next.trim())) {
      setUploadError("Links need to start with https://");
      return;
    }
    setUploadError(null);
    editor.chain().focus().extendMarkRange("link").setLink({ href: next.trim() }).run();
  };

  const addImage = async (file: File) => {
    if (!editor) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadDiscoverMedia(file);
      const alt = window.prompt("Describe this image for people who cannot see it", "") ?? "";
      editor.chain().focus().setImage({ src: uploaded.url, alt }).run();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!layoutOpen) return;
    const close = (event: PointerEvent) => {
      if (!layoutRef.current?.contains(event.target as Node)) setLayoutOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLayoutOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [layoutOpen]);

  if (!editor) return <p className="discover-note">Loading editor…</p>;

  const chain = () => editor.chain().focus();
  const { selection } = editor.state;
  /** Adds blocks after the block holding the cursor (never splitting it); an empty plain line is replaced. */
  const insertContent = (content: object[]) => {
    let from = selection.to;
    let to = selection.to;
    if (selection instanceof TextSelection && selection.$from.depth >= 1) {
      const current = selection.$from.node(1);
      const start = selection.$from.before(1);
      const blank = current.type.name === "paragraph" && current.content.size === 0 && !current.attrs.width;
      from = blank ? start : start + current.nodeSize;
      to = start + current.nodeSize;
    }
    const atEnd = to >= editor.state.doc.content.size;
    run(() => chain().insertContentAt({ from, to }, atEnd ? [...content, { type: "paragraph" }] : content).run());
    const first = editor.state.doc.nodeAt(from);
    if (first?.isTextblock) editor.commands.setTextSelection(from + 1);
  };
  const insertBlock = (type: string, attrs: object) => insertContent([{ type, attrs: structuredClone(attrs) }]);
  const insertLayout = (layout: (typeof LAYOUTS)[number]) => {
    setLayoutOpen(false);
    if (layout.id !== "sample") {
      insertContent([...layout.content()]);
      return;
    }
    const empty = editor.isEmpty;
    if (!empty && !window.confirm("Add the sample page at the cursor? Your existing text stays.")) return;
    run(() => (empty ? chain().setContent({ type: "doc", content: FRAMEWORK_TEMPLATE }).focus("end").run() : chain().insertContent(FRAMEWORK_TEMPLATE).run()));
    if (empty) onChange(editor.getJSON());
  };
  const groups: Tool[][] = [
    [
      { label: "Heading", icon: <Heading2 size={17} />, active: editor.isActive("heading", { level: 2 }), onClick: () => run(() => chain().toggleHeading({ level: 2 }).run()) },
      { label: "Subheading", icon: <Heading3 size={17} />, active: editor.isActive("heading", { level: 3 }), onClick: () => run(() => chain().toggleHeading({ level: 3 }).run()) },
    ],
    [
      { label: "Bold", icon: <Bold size={16} />, active: editor.isActive("bold"), onClick: () => run(() => chain().toggleBold().run()) },
      { label: "Italic", icon: <Italic size={16} />, active: editor.isActive("italic"), onClick: () => run(() => chain().toggleItalic().run()) },
    ],
    [
      { label: "Bulleted list", icon: <List size={17} />, active: editor.isActive("bulletList"), onClick: () => run(() => chain().toggleBulletList().run()) },
      { label: "Numbered list", icon: <ListOrdered size={17} />, active: editor.isActive("orderedList"), onClick: () => run(() => chain().toggleOrderedList().run()) },
      { label: "Quote", icon: <Quote size={16} />, active: editor.isActive("blockquote"), onClick: () => run(() => chain().toggleBlockquote().run()) },
    ],
    [
      { label: "Link", icon: <Link2 size={17} />, active: editor.isActive("link"), onClick: addLink },
      { label: "Image", icon: <ImagePlus size={17} />, disabled: uploading, onClick: () => fileRef.current?.click() },
    ],
    [
      { label: "Callout box", text: "Callout", icon: <MessageSquareText size={17} />, onClick: () => insertBlock("discoverCallout", DEFAULT_CALLOUT) },
      { label: "Card grid", text: "Cards", icon: <LayoutGrid size={17} />, onClick: () => insertBlock("discoverCards", DEFAULT_CARDS) },
      { label: "Action checklist", text: "Checklist", icon: <ListChecks size={17} />, onClick: () => insertBlock("discoverChecklist", DEFAULT_CHECKLIST) },
      {
        label: "YouTube video",
        text: "YouTube",
        icon: <Video size={17} />,
        onClick: () => {
          const pasted = window.prompt("Paste a YouTube link", "https://www.youtube.com/watch?v=");
          if (pasted == null) return;
          const videoId = parseYoutubeVideoId(pasted);
          if (!videoId) {
            setUploadError("That doesn’t look like a YouTube link. Try a watch, share, or embed URL.");
            return;
          }
          setUploadError(null);
          insertBlock("discoverYoutube", { ...DEFAULT_YOUTUBE, videoId });
        },
      },
    ],
    [
      { label: "Undo", icon: <Undo2 size={16} />, disabled: !editor.can().undo(), onClick: () => run(() => chain().undo().run()) },
      { label: "Redo", icon: <Redo2 size={16} />, disabled: !editor.can().redo(), onClick: () => run(() => chain().redo().run()) },
    ],
  ];

  return (
    <div className="discover-rich">
      <div className="discover-rich-bar" role="toolbar" aria-label="Formatting">
        {groups.map((group, index) => (
          <div key={index} className="discover-rich-group">
            {group.map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={tool.active === undefined ? undefined : tool.active}
                disabled={tool.disabled}
                className={tool.className ?? (tool.text ? "discover-rich-insert" : undefined)}
                onClick={tool.onClick}
              >
                {tool.icon}
                {tool.text ? <span>{tool.text}</span> : null}
              </button>
            ))}
            {index === 4 ? (
              <div className="discover-rich-menu-wrap" ref={layoutRef}>
                <button
                  type="button"
                  className="discover-rich-insert"
                  title="Add a layout"
                  aria-haspopup="menu"
                  aria-expanded={layoutOpen}
                  onClick={() => setLayoutOpen((open) => !open)}
                  data-testid="dcb-layout-menu"
                >
                  <LayoutTemplate size={17} />
                  <span>Layout</span>
                  <ChevronDown size={14} />
                </button>
                {layoutOpen ? (
                  <div className="discover-rich-menu" role="menu">
                    {LAYOUTS.map((layout) => (
                      <button key={layout.id} type="button" role="menuitem" onClick={() => insertLayout(layout)}>
                        <span className={`discover-rich-menu-art discover-rich-menu-art--${layout.id}`} aria-hidden>
                          <i />
                          <i />
                          <i />
                        </span>
                        <span>
                          <strong>{layout.label}</strong>
                          <small>{layout.hint}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        {uploading ? <span className="discover-rich-status">Uploading image…</span> : null}
      </div>
      <div className="discover-rich-stage" ref={stageRef}>
        <EditorContent editor={editor} />
        <DiscoverBlockHandles editor={editor} hostRef={stageRef} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void addImage(file);
        }}
      />
      {uploadError ? <p className="discover-error">{uploadError}</p> : null}
    </div>
  );
}
