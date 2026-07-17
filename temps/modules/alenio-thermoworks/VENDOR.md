# ThermoWorks ThermaLib vendor binaries

These files are **proprietary ThermoWorks / ETI materials**. They are not open source.

Alenio copies only the minimum artifacts required to link ThermaLib into the Temps Expo module. The full SDK drop (`ThermaLib-SDK-master`) remains external read-only reference and must not be modified.

## Versions

| Platform | SDK package | Version |
|----------|-------------|---------|
| Android | LE Android SDK Files | **3.0.2.1** |
| iOS | LE iOS SDK Files | **3.0.1** |

First supported device target: **Thermapen ONE Blue** (SDK device type: Thermapen Blue / `PEN_BLUE` / `TLDeviceTypeThermaPenBlue`).

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

## License / redistribution

Do not redistribute these binaries outside Alenio without ThermoWorks authorization.
