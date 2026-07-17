package expo.modules.aleniothermoworks

import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import uk.co.etiltd.thermalib.ThermaLib

class AlenioThermoworksModule : Module() {
  @Volatile
  private var initialized = false

  @Volatile
  private var lastError: String? = null

  @Volatile
  private var cachedSdkVersion: String? = null

  override fun definition() = ModuleDefinition {
    Name("AlenioThermoworks")

    Function("isAvailable") {
      vendorAarPresent() && hasAppContext()
    }

    AsyncFunction("initialize") {
      initializeInternal()
    }

    AsyncFunction("getDiagnostics") {
      val ble = isBluetoothAvailable()
      val version = cachedSdkVersion
      mapOf(
        "module" to "alenio-thermoworks",
        "platform" to "android",
        "sdkVersion" to version,
        "available" to (vendorAarPresent() && hasAppContext()),
        "initialized" to initialized,
        "bluetoothAvailable" to ble,
        "error" to lastError
      )
    }
  }

  private fun initializeInternal(): Map<String, Any?> {
    if (!vendorAarPresent()) {
      lastError = "thermalib.aar missing under modules/alenio-thermoworks/android/libs"
      return result(ok = false, bluetoothAvailable = false, error = lastError)
    }

    val context = appContext.reactContext
      ?: return result(
        ok = false,
        bluetoothAvailable = false,
        error = "React context unavailable"
      ).also { lastError = "React context unavailable" }

    return try {
      val lib = ThermaLib.instance(context.applicationContext)
      val version = lib.versionNumber ?: ""
      cachedSdkVersion = version
      initialized = true
      lastError = null
      val ble = isBluetoothAvailable()
      result(ok = true, sdkVersion = version, bluetoothAvailable = ble, error = null)
    } catch (t: Throwable) {
      initialized = false
      lastError = t.message ?: t.toString()
      result(
        ok = false,
        sdkVersion = cachedSdkVersion ?: "",
        bluetoothAvailable = isBluetoothAvailable(),
        error = lastError
      )
    }
  }

  private fun result(
    ok: Boolean,
    sdkVersion: String = cachedSdkVersion ?: "",
    bluetoothAvailable: Boolean,
    error: String?
  ): Map<String, Any?> = mapOf(
    "ok" to ok,
    "sdkVersion" to sdkVersion,
    "bluetoothAvailable" to bluetoothAvailable,
    "error" to error
  )

  private fun isBluetoothAvailable(): Boolean {
    val context = appContext.reactContext ?: return false
    val hasBle = context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    if (!hasBle) return false
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = manager?.adapter
    return adapter != null && adapter.isEnabled
  }

  private fun hasAppContext(): Boolean = appContext.reactContext != null

  /**
   * Build-time the AAR is a Gradle dependency; at runtime we only know linkage succeeded
   * if ThermaLib class loads. Presence check helps diagnostics before initialize.
   */
  private fun vendorAarPresent(): Boolean {
    return try {
      Class.forName("uk.co.etiltd.thermalib.ThermaLib")
      true
    } catch (_: ClassNotFoundException) {
      false
    }
  }
}
