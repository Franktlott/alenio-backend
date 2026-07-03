import { Outlet, useParams } from "react-router-dom";
import { GoKioskSessionGate } from "../components/alenio-go/GoKioskSessionGate";

export function GoKioskSessionLayout() {
  const { hubToken = "" } = useParams();

  return (
    <GoKioskSessionGate hubToken={hubToken}>
      <Outlet />
    </GoKioskSessionGate>
  );
}
