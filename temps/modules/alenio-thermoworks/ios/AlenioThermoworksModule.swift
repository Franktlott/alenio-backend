import ExpoModulesCore

public class AlenioThermoworksModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlenioThermoworks")

    Events("onDevices", "onError", "onConnection")

    OnCreate {
      ThermaLibFacade.setDevicesBlock { devices in
        self.sendEvent("onDevices", [
          "type": "devices",
          "devices": devices
        ])
      }
      ThermaLibFacade.setErrorBlock { code, message in
        self.sendEvent("onError", [
          "type": "error",
          "code": code,
          "message": message
        ])
      }
      ThermaLibFacade.setConnectionBlock { event in
        self.sendEvent("onConnection", event)
      }
    }

    OnDestroy {
      ThermaLibFacade.shutdownDiscovery()
    }

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
        "scanning": ThermaLibFacade.isScanning(),
        "discoveredCount": ThermaLibFacade.discoveredDevices().count,
        "connectedDeviceId": ThermaLibFacade.connectedDeviceId(),
        "error": nil as String?
      ]
    }

    AsyncFunction("ensureBluetoothPermissions") { () -> [String: Any?] in
      let available = ThermaLibFacade.isBluetoothAvailable()
      return [
        "ok": available,
        "error": available ? nil : "Bluetooth is not available"
      ]
    }

    AsyncFunction("startScan") { () -> [String: Any?] in
      let result = ThermaLibFacade.startScan()
      return [
        "ok": result["ok"] as? Bool ?? false,
        "error": result["error"] as? String
      ]
    }

    AsyncFunction("stopScan") { () -> [String: Any?] in
      let result = ThermaLibFacade.stopScan()
      return [
        "ok": result["ok"] as? Bool ?? false,
        "error": result["error"] as? String
      ]
    }

    AsyncFunction("connect") { (deviceId: String) -> [String: Any?] in
      let result = ThermaLibFacade.connect(deviceId)
      return [
        "ok": result["ok"] as? Bool ?? false,
        "error": result["error"] as? String
      ]
    }

    AsyncFunction("disconnect") { () -> [String: Any?] in
      let result = ThermaLibFacade.disconnect()
      return [
        "ok": result["ok"] as? Bool ?? false,
        "error": result["error"] as? String
      ]
    }

    AsyncFunction("getDiscoveredDevices") { () -> [[String: Any]] in
      return ThermaLibFacade.discoveredDevices() as? [[String: Any]] ?? []
    }
  }
}
