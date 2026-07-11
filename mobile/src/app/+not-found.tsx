import { Redirect } from "expo-router";

/**
 * Unknown routes used to dump users on the Team tab.
 * Send them to welcome instead so deep-link misses are less confusing.
 */
export default function NotFoundScreen() {
  return <Redirect href="/welcome" />;
}
