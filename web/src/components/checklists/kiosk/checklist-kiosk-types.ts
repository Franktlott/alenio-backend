export type KioskTab = "today" | "completed" | "info";

export type KioskTaskItem = {
  id: string;
  title: string;
  note: string | null;
  category: string | null;
  sortOrder: number;
};

export type KioskTaskState = {
  signed: boolean;
  signerName: string;
  signedAt: string | null;
};

export function formatKioskTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function displayCategory(item: KioskTaskItem, locationName: string): string {
  return item.category?.trim() || locationName || "General";
}
