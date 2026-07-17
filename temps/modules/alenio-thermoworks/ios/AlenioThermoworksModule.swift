import ExpoModulesCore

public class AlenioThermoworksModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlenioThermoworks")

    Function("isAvailable") { () -> Bool in
      return ThermaLibFacade.isLinked()
    }

    AsyncFunction("initialize") { () -> [String: Any?] in
      let result = ThermaLibFacade.initializeSdk()
      return [
        "ok": result["ok"] as? Bool ?? false,
        "sdkVersion": result["sdkVersion"] as? String ?? "",
        "bluetoothAvailable": result["bluetoothAvailable"] as? Bool ?? false,
        "error": result["error"] as? String
      ]
    }

    AsyncFunction("getDiagnostics") { () -> [String: Any?] in
      let version = ThermaLibFacade.sdkVersion()
      return [
        "module": "alenio-thermoworks",
        "platform": "ios",
        "sdkVersion": version,
        "available": ThermaLibFacade.isLinked(),
        "initialized": ThermaLibFacade.isInitialized(),
        "bluetoothAvailable": ThermaLibFacade.isBluetoothAvailable(),
        "error": nil as String?
      ]
    }
  }
}
