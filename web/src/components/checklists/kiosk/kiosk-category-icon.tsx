type CategoryIconProps = {
  category: string;
  className?: string;
};

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

export function KioskCategoryIcon({ category, className = "" }: CategoryIconProps) {
  const key = normalizeCategory(category);

  let glyph = "☑";
  if (key.includes("open")) glyph = "🏪";
  else if (key.includes("clean") || key.includes("sanit")) glyph = "✨";
  else if (key.includes("temp") || key.includes("food")) glyph = "🌡";
  else if (key.includes("close")) glyph = "🔒";
  else if (key.includes("cash") || key.includes("register")) glyph = "💵";
  else if (key.includes("deli") || key.includes("kitchen")) glyph = "🍽";

  return (
    <span className={`kiosk-task-row__icon${className ? ` ${className}` : ""}`} aria-hidden>
      {glyph}
    </span>
  );
}
