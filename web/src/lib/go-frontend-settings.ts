export type GoFrontendSettings = {
  heroImageUrl: string | null;
};

export const DEFAULT_GO_FRONTEND_SETTINGS: GoFrontendSettings = {
  heroImageUrl: null,
};

export function resolveGoHeroImage(
  teamImage: string | null | undefined,
  settings: GoFrontendSettings | null | undefined,
): string | null {
  const override = settings?.heroImageUrl?.trim();
  if (override) return override;
  const workspace = teamImage?.trim();
  return workspace || null;
}

export function isUsingWorkspaceHeroImage(settings: GoFrontendSettings | null | undefined): boolean {
  return !settings?.heroImageUrl?.trim();
}

export function goFrontendSettingsEqual(
  a: GoFrontendSettings | null | undefined,
  b: GoFrontendSettings | null | undefined,
): boolean {
  const heroA = a?.heroImageUrl?.trim() || null;
  const heroB = b?.heroImageUrl?.trim() || null;
  return heroA === heroB;
}

export function normalizeGoFrontendSettings(
  settings: Partial<GoFrontendSettings> | null | undefined,
): GoFrontendSettings {
  return {
    heroImageUrl: settings?.heroImageUrl?.trim() || null,
  };
}
