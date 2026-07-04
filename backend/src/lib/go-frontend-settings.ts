export type GoFrontendSettings = {
  /** Override kiosk hero/header image. Null uses the workspace photo. */
  heroImageUrl: string | null;
};

export const DEFAULT_GO_FRONTEND_SETTINGS: GoFrontendSettings = {
  heroImageUrl: null,
};

export function parseGoFrontendSettings(raw: string | null | undefined): GoFrontendSettings {
  if (!raw) return { ...DEFAULT_GO_FRONTEND_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<GoFrontendSettings>;
    const hero =
      parsed.heroImageUrl === null
        ? null
        : typeof parsed.heroImageUrl === "string" && parsed.heroImageUrl.trim()
          ? parsed.heroImageUrl.trim()
          : null;
    return { heroImageUrl: hero };
  } catch {
    return { ...DEFAULT_GO_FRONTEND_SETTINGS };
  }
}

export function serializeGoFrontendSettings(settings: GoFrontendSettings): string | null {
  const hero = settings.heroImageUrl?.trim();
  if (!hero) return null;
  return JSON.stringify({ heroImageUrl: hero });
}

export function parseGoFrontendSettingsPatch(
  body: unknown,
): { ok: true; value: GoFrontendSettings } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid Alenio Go frontend settings payload" };
  }
  const input = body as Partial<GoFrontendSettings>;
  if (input.heroImageUrl !== undefined && input.heroImageUrl !== null) {
    if (typeof input.heroImageUrl !== "string" || !input.heroImageUrl.trim()) {
      return { ok: false, message: "Header image must be a valid URL or null" };
    }
    return { ok: true, value: { heroImageUrl: input.heroImageUrl.trim() } };
  }
  return { ok: true, value: { heroImageUrl: null } };
}

export function resolveGoHeroImage(
  teamImage: string | null | undefined,
  settings: GoFrontendSettings,
): string | null {
  const override = settings.heroImageUrl?.trim();
  if (override) return override;
  const workspace = teamImage?.trim();
  return workspace || null;
}
