import {
  getAndroidPlayStoreUrl,
  getIosAppStoreUrl,
  getMobileStoreUrl,
  openNativeApp,
} from "../lib/app-links";
import { isAndroidBrowser, isIosBrowser } from "../lib/mobile-browser";

type Props = {
  appUrl: string;
  primaryLabel?: string;
  onContinueInBrowser?: () => void;
  continueInBrowserLabel?: string;
  showStoreButtons?: boolean;
};

export function MobileAppCta({
  appUrl,
  primaryLabel = "Open in Alenio app",
  onContinueInBrowser,
  continueInBrowserLabel = "Continue in browser",
  showStoreButtons = true,
}: Props) {
  const iosStore = getIosAppStoreUrl();
  const androidStore = getAndroidPlayStoreUrl();
  const storeUrl = getMobileStoreUrl();

  return (
    <div className="mobile-app-cta" data-testid="mobile-app-cta">
      <button type="button" className="auth-btn-primary" onClick={() => openNativeApp(appUrl)} data-testid="mobile-open-app">
        {primaryLabel}
      </button>

      {showStoreButtons && storeUrl ? (
        <a
          href={storeUrl}
          className="auth-btn-secondary mobile-app-cta-store"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="mobile-store-link"
        >
          {isIosBrowser() ? "Download on the App Store" : isAndroidBrowser() ? "Get it on Google Play" : "Download the app"}
        </a>
      ) : null}

      {showStoreButtons && !storeUrl && (iosStore || androidStore) ? (
        <div className="mobile-app-cta-store-row">
          {iosStore ? (
            <a href={iosStore} className="auth-btn-secondary mobile-app-cta-store" target="_blank" rel="noopener noreferrer">
              App Store
            </a>
          ) : null}
          {androidStore ? (
            <a href={androidStore} className="auth-btn-secondary mobile-app-cta-store" target="_blank" rel="noopener noreferrer">
              Google Play
            </a>
          ) : null}
        </div>
      ) : null}

      {onContinueInBrowser ? (
        <button type="button" className="mobile-app-cta-browser" onClick={onContinueInBrowser} data-testid="mobile-continue-browser">
          {continueInBrowserLabel}
        </button>
      ) : null}
    </div>
  );
}
