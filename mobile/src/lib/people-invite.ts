import type { AppVersionInfo } from "@/lib/app-version";

export type PeopleInviteIdentity = {
  displayName?: string | null;
  username?: string | null;
};

export type PeopleInviteContent = {
  subject: string;
  body: string;
  shareMessage: string;
};

function cleanInline(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function safeStoreUrls(info: AppVersionInfo | null | undefined): string[] {
  if (!info) return [];
  return [info.iosStoreUrl, info.androidStoreUrl]
    .map((value) => value?.trim() ?? "")
    .filter((value): value is string => /^https?:\/\/\S+$/i.test(value));
}

export function buildPeopleInvite(
  sender: PeopleInviteIdentity,
  appVersion: AppVersionInfo | null | undefined,
): PeopleInviteContent {
  const displayName = cleanInline(sender.displayName, "A friend");
  const rawUsername = cleanInline(sender.username, "");
  const username = rawUsername ? `@${rawUsername.replace(/^@+/, "")}` : null;
  const finder = username
    ? `Open People in Alenio and search for ${username} to send me a connection request.`
    : `Open People in Alenio and search for “${displayName}” to send me a connection request.`;
  const stores = safeStoreUrls(appVersion);
  const installCopy =
    stores.length > 0
      ? `\n\nGet Alenio:\n${stores.join("\n")}`
      : "\n\nDownload Alenio from the App Store or Google Play.";
  const body = [
    `Hi! It’s ${displayName}. I’d like to connect with you on Alenio.`,
    finder,
    "This invitation does not add you to a workspace or connect us automatically.",
  ].join("\n\n") + installCopy;

  return {
    subject: `${displayName} invited you to connect on Alenio`,
    body,
    shareMessage: body,
  };
}
