# ThermoWorks ThermaLib vendor binaries

These files are **proprietary ThermoWorks / ETI materials**. They are not open source.

Alenio copies only the minimum artifacts required to link ThermaLib into the Temps Expo module. The full SDK drop (`ThermaLib-SDK-master`) remains external read-only reference and must not be modified.

## Versions

| Platform | SDK package | Version |
|----------|-------------|---------|
| Android | LE Android SDK Files | **3.0.2.1** |
| iOS | LE iOS SDK Files | **3.0.1** |

Supported device targets:
- **Thermapen ONE Blue** — SDK: Thermapen Blue / `PEN_BLUE` / `TLDeviceTypeThermaPenBlue`
- **TempTest Blue** — SDK: `TEMPTEST_BLUE` / `TLDeviceTypeTempTestBlue`

## Original source locations (reference drop)

Copied from a local read-only ThermoWorks SDK folder:

```text
ThermaLib-SDK-master/LE Android SDK Files v3.0.2.1/thermalib.aar
  → android/libs/thermalib.aar

ThermaLib-SDK-master/LE iOS SDK Files v3.0.1/ThermaLib/libThermaLib.a
  → ios/Vendor/libThermaLib.a

ThermaLib-SDK-master/LE iOS SDK Files v3.0.1/ThermaLib/include/ThermaLib/*
  → ios/Vendor/include/ThermaLib/*
```

## Git policy

Vendor binaries (`.aar`, `.a`, and headers under `ios/Vendor/`) are **gitignored** until ThermoWorks confirms that storing them in Alenio’s private repository is permitted.

Developers must copy the files locally from the approved SDK drop before native builds.

## Phase 3A–3C — Discovery + Connection + Readings API (Temps module)

Native module `AlenioThermoworks`:

| Method / event | Notes |
|----------------|-------|
| `startScan()` / `stopScan()` | BLE scan; Android timeout 10s |
| `connect(deviceId)` / `disconnect()` | Wait for ThermaLib `ready` before `connected`; iOS uses `disconectFromDevice:` |
| `onDevices` | Filtered: `PEN_BLUE` + `TEMPTEST_BLUE`; provisional UNKNOWN + `/thermapen|temptest/i` |
| `onButtonPress` | ThermaLib button / measure-transfer → capture request for Save Reading |
| `onConnection` | `connecting` / `connected` / `disconnecting` / `disconnected` + reason |
| `onReading` | Canonical °C from `TLSensor.reading` / `Sensor.getReading()`; `NO_VALUE` → null; includes battery/sequence when known |
| `onError` | Non-fatal scan/connect/permission errors |
| Logs | Tag `AlenioThermoworks` — scan, filter, connect, disconnect, readings |

Device ids are session-scoped: `tw:{transportIdentifier}`. Manual disconnect is flagged so ProbeSession suppresses reconnect. Sensor index: iOS 1-based, Android 0-based (normalized in payloads).

## License / redistribution

Do not redistribute these binaries outside Alenio without ThermoWorks authorization.
