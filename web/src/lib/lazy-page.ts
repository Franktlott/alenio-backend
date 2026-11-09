import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** Load a named page export only when that route renders. */
export function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<ComponentType<Record<string, unknown>>> {
  return lazy(async () => {
    const mod = await loader();
    const Page = mod[exportName];
    if (typeof Page !== "function") {
      throw new Error(`Missing export ${exportName}`);
    }
    return { default: Page as ComponentType<Record<string, unknown>> };
  });
}
