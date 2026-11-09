import { Extension, Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  DEFAULT_CALLOUT,
  DEFAULT_CARDS,
  DEFAULT_CHECKLIST,
  DISCOVER_ICONS,
  DISCOVER_TONES,
  MAX_DISCOVER_CARDS,
  type DiscoverCalloutAttrs,
  type DiscoverCard,
  type DiscoverCardGridAttrs,
  type DiscoverChecklistAttrs,
} from "../../lib/discover-blocks";
import { DiscoverCallout, DiscoverCardGrid, DiscoverChecklist } from "./DiscoverDesignedBlocks";

type NodeViewProps = ReactNodeViewProps<HTMLElement>;

export const BLOCK_WIDTHS = [
  { value: "full", label: "Full", title: "Full width" },
  { value: "2/3", label: "⅔", title: "Two-thirds width" },
  { value: "1/2", label: "½", title: "Half width" },
  { value: "1/3", label: "⅓", title: "One-third width" },
] as const;

export const SIZED_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "image",
  "discoverCallout",
  "discoverCards",
  "discoverChecklist",
];

/** Lets any top-level block sit beside others; blocks fill a row left to right, then wrap. */
export const BlockWidth = Extension.create({
  name: "discoverBlockWidth",
  addGlobalAttributes() {
    return [
      {
        types: SIZED_TYPES,
        attributes: {
          width: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-width"),
            renderHTML: (attrs: Record<string, unknown>) => (attrs.width ? { "data-width": String(attrs.width) } : {}),
          },
        },
      },
    ];
  },
});

export function widthAttrs(node: PMNode, width: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...node.attrs, width: width === "full" ? null : width };
  // Older blocks used a "beside text above" switch; an explicit width replaces it.
  if ("layout" in node.attrs) next.layout = "full";
  return next;
}

function IconSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <label className="dcb-blk-field dcb-blk-field--inline">
      <span>Icon</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(DISCOVER_ICONS).map(([key, { label }]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TonePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="dcb-blk-field dcb-blk-field--inline">
      <span>Color</span>
      <div className="dcb-blk-tones" role="radiogroup" aria-label="Color">
        {Object.entries(DISCOVER_TONES).map(([key, tone]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            aria-label={tone.label}
            title={tone.label}
            className="dcb-blk-tone"
            style={{ background: tone.fg }}
            onClick={() => onChange(key)}
          />
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="dcb-blk-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={3}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

/** A designed block in the editor: its live preview, with a small edit / delete bar on hover. */
function BlockFrame({
  props,
  label,
  defaults,
  preview,
  form,
}: {
  props: NodeViewProps;
  label: string;
  defaults: object;
  preview: ReactNode;
  form: ReactNode;
}) {
  const { node, deleteNode, selected } = props;
  // A block that still has its starter text was just inserted, so open its settings.
  const [editing, setEditing] = useState(() => {
    const { width: _width, ...rest } = node.attrs;
    return JSON.stringify(rest) === JSON.stringify(defaults);
  });

  return (
    <NodeViewWrapper
      className={`dcb-blk${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`}
      data-testid={`dcb-blk-${node.type.name}`}
    >
      <div className="dcb-blk-bar" contentEditable={false}>
        <span className="dcb-blk-label">{label}</span>
        <span className="dcb-blk-actions">
          <button
            type="button"
            className="dcb-blk-edit"
            aria-expanded={editing}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
            {editing ? "Done" : "Edit"}
          </button>
          <button type="button" title="Remove block" aria-label="Remove block" onClick={() => deleteNode()}>
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      <div className="dcb-blk-preview" contentEditable={false}>
        {preview}
      </div>
      {editing ? (
        <div className="dcb-blk-form" contentEditable={false}>
          {form}
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function CalloutView(props: NodeViewProps) {
  const attrs = props.node.attrs as DiscoverCalloutAttrs;
  const set = (patch: Partial<DiscoverCalloutAttrs>) => props.updateAttributes(patch);
  return (
    <BlockFrame
      props={props}
      label="Callout"
      defaults={DEFAULT_CALLOUT}
      preview={<DiscoverCallout attrs={attrs} />}
      form={
        <>
          <TextField label="Heading" value={attrs.title} maxLength={120} onChange={(title) => set({ title })} />
          <TextField label="Text" value={attrs.text} maxLength={1000} multiline onChange={(text) => set({ text })} />
          <div className="dcb-blk-row">
            <IconSelect value={attrs.icon} onChange={(icon) => set({ icon })} />
            <TonePicker value={attrs.tone} onChange={(tone) => set({ tone })} />
          </div>
        </>
      }
    />
  );
}

function CardsView(props: NodeViewProps) {
  const attrs = props.node.attrs as DiscoverCardGridAttrs;
  const cards = attrs.cards ?? [];
  const setCards = (next: DiscoverCard[]) => props.updateAttributes({ cards: next });
  const setCard = (index: number, patch: Partial<DiscoverCard>) =>
    setCards(cards.map((card, cardIndex) => (cardIndex === index ? { ...card, ...patch } : card)));
  return (
    <BlockFrame
      props={props}
      label={`Card grid · ${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
      defaults={DEFAULT_CARDS}
      preview={<DiscoverCardGrid attrs={attrs} />}
      form={
        <>
          {cards.map((card, index) => (
            <fieldset key={index} className="dcb-blk-card">
              <legend>
                Card {index + 1}
                <button
                  type="button"
                  className="dcb-blk-card-remove"
                  aria-label={`Remove card ${index + 1}`}
                  disabled={cards.length <= 1}
                  onClick={() => setCards(cards.filter((_, cardIndex) => cardIndex !== index))}
                >
                  <Trash2 size={13} />
                </button>
              </legend>
              <div className="dcb-blk-row">
                <TextField
                  label="Letter or number"
                  value={card.kicker}
                  maxLength={3}
                  placeholder="F"
                  onChange={(kicker) => setCard(index, { kicker })}
                />
                <TextField label="Title" value={card.title} maxLength={80} onChange={(title) => setCard(index, { title })} />
              </div>
              <TextField label="Text" value={card.text} maxLength={400} multiline onChange={(text) => setCard(index, { text })} />
              <div className="dcb-blk-row">
                <IconSelect value={card.icon} onChange={(icon) => setCard(index, { icon })} />
                <TonePicker value={card.tone} onChange={(tone) => setCard(index, { tone })} />
              </div>
            </fieldset>
          ))}
          {cards.length < MAX_DISCOVER_CARDS ? (
            <button
              type="button"
              className="dcb-blk-add"
              onClick={() =>
                setCards([
                  ...cards,
                  { icon: "star", tone: "orange", kicker: String(cards.length + 1), title: "New point", text: "" },
                ])
              }
            >
              <Plus size={14} />
              Add card
            </button>
          ) : (
            <p className="dcb-blk-note">Up to {MAX_DISCOVER_CARDS} cards per grid.</p>
          )}
        </>
      }
    />
  );
}

function ChecklistView(props: NodeViewProps) {
  const attrs = props.node.attrs as DiscoverChecklistAttrs;
  const set = (patch: Partial<DiscoverChecklistAttrs>) => props.updateAttributes(patch);
  return (
    <BlockFrame
      props={props}
      label="Action checklist"
      defaults={DEFAULT_CHECKLIST}
      preview={<DiscoverChecklist attrs={attrs} />}
      form={
        <>
          <TextField label="Heading" value={attrs.title} maxLength={120} onChange={(title) => set({ title })} />
          <TextField
            label="Steps (one per line)"
            value={(attrs.items ?? []).join("\n")}
            multiline
            onChange={(value) => set({ items: value.split("\n").slice(0, 12) })}
          />
          <div className="dcb-blk-row">
            <IconSelect value={attrs.icon} onChange={(icon) => set({ icon })} />
            <TonePicker value={attrs.tone} onChange={(tone) => set({ tone })} />
          </div>
        </>
      }
    />
  );
}

function designedNode(name: string, defaults: Record<string, unknown>, view: ComponentType<NodeViewProps>) {
  const tag = `div[data-discover-block="${name}"]`;
  const read = (element: HTMLElement) => {
    try {
      return JSON.parse(element.getAttribute("data-attrs") ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    addAttributes() {
      return Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          {
            default: value,
            parseHTML: (element: HTMLElement) => read(element)[key] ?? value,
            renderHTML: () => ({}),
          },
        ]),
      );
    },
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ node }) {
      return ["div", { "data-discover-block": name, "data-attrs": JSON.stringify(node.attrs) }];
    },
    addNodeView() {
      return ReactNodeViewRenderer(view, {
        // Always set, so going back to full width replaces the old value instead of leaving it behind.
        attrs: ({ node }) => ({ "data-width": node.attrs.width ? String(node.attrs.width) : "full" }),
      });
    },
  });
}

export const DiscoverCalloutNode = designedNode("discoverCallout", DEFAULT_CALLOUT, CalloutView);
export const DiscoverCardsNode = designedNode("discoverCards", DEFAULT_CARDS, CardsView);
export const DiscoverChecklistNode = designedNode("discoverChecklist", DEFAULT_CHECKLIST, ChecklistView);
