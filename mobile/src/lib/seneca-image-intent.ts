const ACTION_THEN_IMAGE =
  /\b(generate|create|make|draw|design|render|illustrate|paint|sketch)\b.{0,80}\b(image|picture|photo|illustration|graphic|artwork|poster|logo|icon|wallpaper|gif|animation|meme|banner|flyer|card|invitation|thumbnail|avatar|sticker|emoji|diagram|infographic|mockup)\b/i;

const IMAGE_THEN_ACTION =
  /\b(image|picture|photo|illustration|graphic|artwork|poster|logo|icon|wallpaper|gif|animation|meme|banner|flyer|card|invitation|thumbnail|avatar|sticker|emoji|diagram|infographic|mockup)\b.{0,50}\b(generate|create|make|draw|design|render|illustrate|paint|sketch)\b/i;

const DIRECT_IMAGE_REQUEST =
  /\b(show|give)\s+me\s+(an?|the)\s+(image|picture|illustration|graphic|artwork|gif|meme|poster|logo|banner|flyer|card|sticker|diagram)\b/i;

const VISUAL_FIRST_ACTION =
  /^\s*(draw|illustrate|paint|sketch|render|visualize)\b/i;

const EDIT_ACTION =
  /\b(change|recolou?r|remove|replace|add|retouch|crop|resize|edit|modify|adjust)\b/i;

const APPLY_STYLE =
  /\bapply\b.{0,40}\b(style|look|effect|filter|aesthetic|treatment)\b/i;

const TURN_INTO = /\bturn\b.{1,80}\binto\b/i;
const MAKE_VISUAL_CHANGE =
  /\bmake\s+(?:the|this|that|it|my|an?)\s+.{1,80}/i;

export function isSenecaImageRequest(value: string): boolean {
  const prompt = value.trim();
  if (prompt.length < 5) return false;
  return (
    ACTION_THEN_IMAGE.test(prompt) ||
    IMAGE_THEN_ACTION.test(prompt) ||
    DIRECT_IMAGE_REQUEST.test(prompt) ||
    VISUAL_FIRST_ACTION.test(prompt)
  );
}

export function isSenecaImageEditRequest(
  value: string,
  attachmentMimeType?: string | null,
): boolean {
  const isEditableImage =
    attachmentMimeType === "image/jpeg" ||
    attachmentMimeType === "image/png" ||
    attachmentMimeType === "image/webp";
  if (!isEditableImage) return false;

  const prompt = value.trim();
  if (prompt.length < 3) return false;

  return (
    EDIT_ACTION.test(prompt) ||
    APPLY_STYLE.test(prompt) ||
    TURN_INTO.test(prompt) ||
    MAKE_VISUAL_CHANGE.test(prompt)
  );
}
