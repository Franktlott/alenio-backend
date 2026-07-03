import { postGoDeviceCheckIn } from "./api";
import { clearGoLinkedWorkspace, defaultGoDeviceLabel, getGoDeviceId } from "./go-device";

export const GO_DEVICE_UNLINKED_MESSAGE = "This device was unlinked. Link again to continue.";

export function isGoDeviceUnlinkedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("unlinked") ||
    msg.includes("not approved") ||
    msg.includes("device not linked")
  );
}

/** Clear saved workspace link and return the tablet to the linking page. */
export function disconnectGoDevice(): void {
  clearGoLinkedWorkspace();
  if (typeof window !== "undefined") {
    window.location.replace(`${window.location.origin}/aleniogo`);
  }
}

export async function verifyGoDeviceCheckIn(hubToken: string): Promise<boolean> {
  try {
    const result = await postGoDeviceCheckIn(hubToken, getGoDeviceId(), defaultGoDeviceLabel());
    if (!result.approved) {
      disconnectGoDevice();
      return false;
    }
    return true;
  } catch (err) {
    if (isGoDeviceUnlinkedError(err)) {
      disconnectGoDevice();
      return false;
    }
    throw err;
  }
}

export function handleGoDeviceSessionError(err: unknown): boolean {
  if (!isGoDeviceUnlinkedError(err)) return false;
  disconnectGoDevice();
  return true;
}
