import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  addHingeChangeListener,
  getHingeStatus,
  type HingeStatus,
} from '../../modules/alenio-hinge';
import { screenRotates } from './screen-rotation';

/**
 * The `orientation` option to hand to a native stack navigator.
 *
 * Measured on the window rather than `Dimensions.screen`, which reports
 * `UIScreen.mainScreen` and so never leaves the folded panel on a foldable.
 *
 * Every stack in the app needs this, not just the root one. react-native-
 * screens resolves orientation from the innermost screen outwards, and a
 * screen that was never given the option answers with the platform default
 * rather than deferring, which silently overrides whatever an outer navigator
 * asked for.
 *
 * On iOS this is not what actually holds the device in place — the same rule
 * is enforced natively by `plugins/with-foldable-orientation.js`, because the
 * navigator option never reaches UIKit under the dev client. Keep the two in
 * agreement.
 *
 * An open hinge always allows rotation, even while the window is still one
 * leaf-sized — otherwise portrait-lock keeps Duo from spanning both screens.
 */
export function useScreenOrientation(): 'all' | 'portrait_up' {
  const { width, height } = useWindowDimensions();
  const [hinge, setHinge] = useState<HingeStatus>(() => getHingeStatus());

  useEffect(() => {
    const sub = addHingeChangeListener((event) => setHinge(event.status));
    setHinge(getHingeStatus());
    return () => {
      sub?.remove();
    };
  }, []);

  if (hinge === 'fullyOpen' || hinge === 'partiallyOpen') return 'all';
  return screenRotates(width, height) ? 'all' : 'portrait_up';
}
