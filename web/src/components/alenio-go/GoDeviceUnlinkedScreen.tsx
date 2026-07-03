import { AlenioGoLogo } from "../AlenioGoLogo";
import { GO_DEVICE_UNLINKED_MESSAGE } from "../../lib/go-session";

type Props = {
  message?: string;
  checking?: boolean;
};

export function GoDeviceUnlinkedScreen({
  message = GO_DEVICE_UNLINKED_MESSAGE,
  checking = false,
}: Props) {
  return (
    <div className="go-device-unlinked" data-testid="go-device-unlinked">
      <AlenioGoLogo variant="header" />
      <h1>{checking ? "Checking device link…" : "Device disconnected"}</h1>
      <p>{checking ? "One moment while we verify this tablet." : message}</p>
      {!checking ? <p className="go-device-unlinked-sub">Returning to the linking page…</p> : null}
    </div>
  );
}
