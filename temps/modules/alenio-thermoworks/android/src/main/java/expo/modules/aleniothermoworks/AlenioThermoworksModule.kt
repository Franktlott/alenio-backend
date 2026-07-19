package expo.modules.aleniothermoworks

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import uk.co.etiltd.thermalib.Device
import uk.co.etiltd.thermalib.DeviceType
import uk.co.etiltd.thermalib.Sensor
import uk.co.etiltd.thermalib.ThermaLib
import kotlin.math.abs

class AlenioThermoworksModule : Module() {
  @Volatile
  private var initialized = false

  @Volatile
  private var lastError: String? = null

  @Volatile
  private var cachedSdkVersion: String? = null

  @Volatile
  private var scanning = false

  @Volatile
  private var manualDisconnect = false

  private var callbackHandle: Any? = null
  private var connectedDeviceId: String? = null
  private var connectingDeviceId: String? = null
  private var readingSequence = 0
  private var lastBatteryPercent: Int? = null
  private var lastEmittedReadingKey: String? = null

  private val emitted = linkedMapOf<String, Map<String, Any?>>()
  private val pending = mutableSetOf<String>()
  private val devicesById = linkedMapOf<String, Device>()

  private val scanCallbacks = object : ThermaLib.ClientCallbacksBase() {
    override fun onNewDevice(device: Device, timestamp: Long) {
      log("onNewDevice id=${device.identifier} name=${device.deviceName} type=${device.deviceType}")
      if (processDevice(device, "onNewDevice")) {
        emitDevices()
      }
    }

    override fun onDeviceUpdated(device: Device, timestamp: Long) {
      val id = deviceIdFor(device)
      devicesById[id] = device
      val interested =
        pending.contains(id) ||
          emitted.containsKey(id) ||
          scanning ||
          connectingDeviceId == id ||
          connectedDeviceId == id
      if (!interested) return

      log("onDeviceUpdated id=$id name=${device.deviceName} type=${device.deviceType} ready=${device.isReady}")
      if (processDevice(device, "onDeviceUpdated")) {
        emitDevices()
      }
      maybeEmitConnectedIfReady(device)
      if (connectedDeviceId == id && device.isReady) {
        emitReadingFromDevice(device, "onDeviceUpdated")
      }
    }

    override fun onDeviceReady(device: Device, timestamp: Long) {
      log("onDeviceReady id=${device.identifier}")
      devicesById[deviceIdFor(device)] = device
      processDevice(device, "onDeviceReady")
      maybeEmitConnectedIfReady(device)
      if (connectedDeviceId == deviceIdFor(device) && device.isReady) {
        emitReadingFromDevice(device, "onDeviceReady")
      }
    }

    override fun onBatteryLevelReceived(device: Device, level: Int, timestamp: Long) {
      val id = deviceIdFor(device)
      if (connectedDeviceId != id) return
      lastBatteryPercent = level
      log("battery id=$id level=$level")
      emitReadingFromDevice(device, "onBatteryLevelReceived")
    }

    override fun onDeviceNotificationReceived(
      device: Device,
      notificationType: Int,
      payload: ByteArray,
      timestamp: Long
    ) {
      val id = deviceIdFor(device)
      log("onDeviceNotificationReceived id=$id type=$notificationType")
      if (notificationType != Device.NotificationType.BUTTON_PRESSED) return
      if (connectedDeviceId != id) {
        log("buttonPress ignored (not connected device) id=$id")
        return
      }
      emitReadingFromDevice(device, "ButtonPressed")
      emitButtonPress(id, timestamp)
    }

    override fun onDeviceConnectionStateChanged(
      device: Device,
      newState: Device.ConnectionState?,
      timestamp: Long
    ) {
      log(
        "onDeviceConnectionStateChanged id=${device.identifier} state=${device.connectionState} ready=${device.isReady}"
      )
      devicesById[deviceIdFor(device)] = device
      if (device.isReady) {
        maybeEmitConnectedIfReady(device)
      }
      // Manual disconnect often arrives as DISCONNECTED rather than unexpected-disconnect.
      if (device.connectionState == Device.ConnectionState.DISCONNECTED) {
        val id = deviceIdFor(device)
        if (connectedDeviceId == id || connectingDeviceId == id) {
          handleDisconnection(device, null, null, unexpectedCallback = false)
        }
      }
    }

    override fun onUnexpectedDeviceDisconnection(
      device: Device,
      message: String?,
      reason: ThermaLib.ClientCallbacks.DeviceDisconnectionReason?,
      timestamp: Long
    ) {
      handleDisconnection(device, reason, message, unexpectedCallback = true)
    }

    override fun onScanComplete(
      transport: Int,
      scanResult: ThermaLib.ScanResult,
      numDevices: Int,
      errorMsg: String?
    ) {
      scanning = false
      log(
        "onScanComplete result=$scanResult numDevices=$numDevices error=${errorMsg ?: "—"} emitted=${emitted.size}"
      )
      if (scanResult != ThermaLib.ScanResult.SUCCESS) {
        emitError(
          "SCAN_FAILED",
          errorMsg ?: "Scan completed with result $scanResult"
        )
      }
      emitDevices()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AlenioThermoworks")

    Events("onDevices", "onError", "onConnection", "onReading", "onButtonPress")

    OnDestroy {
      shutdownDiscovery()
    }

    Function("isAvailable") {
      vendorAarPresent() && hasAppContext()
    }

    AsyncFunction("initialize") {
      initializeInternal()
    }

    AsyncFunction("getDiagnostics") {
      mapOf(
        "module" to "alenio-thermoworks",
        "platform" to "android",
        "sdkVersion" to cachedSdkVersion,
        "available" to (vendorAarPresent() && hasAppContext()),
        "initialized" to initialized,
        "bluetoothAvailable" to isBluetoothAvailable(),
        "scanning" to scanning,
        "discoveredCount" to emitted.size,
        "connectedDeviceId" to connectedDeviceId,
        "error" to lastError
      )
    }

    AsyncFunction("ensureBluetoothPermissions") {
      ensureBluetoothPermissionsInternal()
    }

    AsyncFunction("startScan") {
      startScanInternal()
    }

    AsyncFunction("stopScan") {
      stopScanInternal()
    }

    AsyncFunction("connect") { deviceId: String ->
      connectInternal(deviceId)
    }

    AsyncFunction("disconnect") {
      disconnectInternal()
    }

    AsyncFunction("getDiscoveredDevices") {
      discoveredList()
    }
  }

  private fun initializeInternal(): Map<String, Any?> {
    if (!vendorAarPresent()) {
      lastError = "thermalib.aar missing under modules/alenio-thermoworks/android/libs"
      log("initialize failed: $lastError")
      return result(ok = false, bluetoothAvailable = false, error = lastError)
    }

    val context = appContext.reactContext
      ?: return result(
        ok = false,
        bluetoothAvailable = false,
        error = "React context unavailable"
      ).also {
        lastError = "React context unavailable"
        log("initialize failed: React context unavailable")
      }

    return try {
      val lib = ThermaLib.instance(context.applicationContext)
      val version = lib.versionNumber ?: ""
      cachedSdkVersion = version
      initialized = true
      lastError = null
      ensureCallbacksRegistered(lib)
      val ble = isBluetoothAvailable()
      log("initialize ok sdkVersion=$version bluetoothAvailable=$ble")
      result(ok = true, sdkVersion = version, bluetoothAvailable = ble, error = null)
    } catch (t: Throwable) {
      initialized = false
      lastError = t.message ?: t.toString()
      log("initialize exception: $lastError")
      result(
        ok = false,
        sdkVersion = cachedSdkVersion ?: "",
        bluetoothAvailable = isBluetoothAvailable(),
        error = lastError
      )
    }
  }

  private fun ensureCallbacksRegistered(lib: ThermaLib) {
    if (callbackHandle != null) return
    callbackHandle = lib.registerCallbacks(scanCallbacks, LOG_TAG)
    log("ClientCallbacks registered handle=$callbackHandle")
  }

  private fun ensureBluetoothPermissionsInternal(): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return mapOf("ok" to false, "error" to "React context unavailable")

    val missing = requiredPermissions().filter {
      ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
    }

    if (missing.isEmpty()) {
      return mapOf("ok" to true, "error" to null)
    }

    val activity = appContext.currentActivity
    if (activity == null) {
      val msg = "Bluetooth permissions required: ${missing.joinToString()}"
      emitError("SCAN_FAILED", msg)
      return mapOf("ok" to false, "error" to msg)
    }

    log("ensureBluetoothPermissions requesting ${missing.joinToString()}")
    activity.requestPermissions(missing.toTypedArray(), REQUEST_CODE_BT)
    val stillMissing = requiredPermissions().filter {
      ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
    }
    return if (stillMissing.isEmpty()) {
      mapOf("ok" to true, "error" to null)
    } else {
      mapOf(
        "ok" to false,
        "error" to "Bluetooth permissions not granted yet — accept the system prompt and try again"
      )
    }
  }

  private fun requiredPermissions(): List<String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      listOf(
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_CONNECT
      )
    } else {
      listOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }
  }

  private fun startScanInternal(): Map<String, Any?> {
    log("startScan requested")

    if (!initialized) {
      val init = initializeInternal()
      if (init["ok"] != true) {
        val error = init["error"] as? String ?: "ThermaLib not initialized"
        emitError("SCAN_FAILED", error)
        return mapOf("ok" to false, "error" to error)
      }
    }

    val perm = ensureBluetoothPermissionsInternal()
    if (perm["ok"] != true) {
      val error = perm["error"] as? String ?: "Bluetooth permissions denied"
      emitError("SCAN_FAILED", error)
      return mapOf("ok" to false, "error" to error)
    }

    if (!isBluetoothAvailable()) {
      val error = "Bluetooth is not available"
      emitError("SCAN_FAILED", error)
      return mapOf("ok" to false, "error" to error)
    }

    val context = appContext.reactContext
      ?: return mapOf("ok" to false, "error" to "React context unavailable").also {
        emitError("SCAN_FAILED", "React context unavailable")
      }

    return try {
      val lib = ThermaLib.instance(context.applicationContext)
      ensureCallbacksRegistered(lib)
      emitted.clear()
      pending.clear()
      emitDevices()
      val started = lib.startScanForDevices(ThermaLib.Transport.BLUETOOTH_LE, SCAN_TIMEOUT_SEC)
      if (!started) {
        scanning = false
        val error = "ThermaLib startScanForDevices returned false (already scanning?)"
        emitError("SCAN_FAILED", error)
        return mapOf("ok" to false, "error" to error)
      }
      scanning = true
      log("startScan started BLUETOOTH_LE timeout=${SCAN_TIMEOUT_SEC}s")
      mapOf("ok" to true, "error" to null)
    } catch (t: Throwable) {
      scanning = false
      val error = t.message ?: t.toString()
      emitError("SCAN_FAILED", error)
      mapOf("ok" to false, "error" to error)
    }
  }

  private fun stopScanInternal(): Map<String, Any?> {
    log("stopScan requested scanning=$scanning")
    val context = appContext.reactContext
      ?: return mapOf("ok" to false, "error" to "React context unavailable")
    return try {
      ThermaLib.instance(context.applicationContext).stopScanForDevices()
      scanning = false
      mapOf("ok" to true, "error" to null)
    } catch (t: Throwable) {
      val error = t.message ?: t.toString()
      emitError("SCAN_FAILED", error)
      mapOf("ok" to false, "error" to error)
    }
  }

  private fun connectInternal(deviceId: String): Map<String, Any?> {
    log("connect requested deviceId=$deviceId")

    if (!initialized) {
      val init = initializeInternal()
      if (init["ok"] != true) {
        val error = init["error"] as? String ?: "ThermaLib not initialized"
        emitError("CONNECT_FAILED", error)
        return mapOf("ok" to false, "error" to error)
      }
    }

    val device = resolveDevice(deviceId)
    if (device == null) {
      val error = "Unknown device: $deviceId"
      emitError("CONNECT_FAILED", error)
      return mapOf("ok" to false, "error" to error)
    }

    val classified = classify(device)
    if (classified == "OTHER") {
      val error = "Device is not a supported ThermoWorks probe"
      emitError("CONNECT_FAILED", error)
      return mapOf("ok" to false, "error" to error)
    }

    return try {
      val context = appContext.reactContext
        ?: return mapOf("ok" to false, "error" to "React context unavailable")
      val lib = ThermaLib.instance(context.applicationContext)
      if (scanning) {
        lib.stopScanForDevices()
        scanning = false
      }

      manualDisconnect = false
      connectingDeviceId = deviceId
      connectedDeviceId = null
      emitConnection("connecting", deviceId, null, null)

      if (device.isReady) {
        connectingDeviceId = null
        connectedDeviceId = deviceId
        readingSequence = 0
        lastBatteryPercent = null
        lastEmittedReadingKey = null
        log("connect: already ready id=$deviceId")
        emitConnection("connected", deviceId, null, null)
        emitReadingFromDevice(device, "connectAlreadyReady")
        return mapOf("ok" to true, "error" to null)
      }

      device.requestConnection()
      log("requestConnection issued id=$deviceId")
      mapOf("ok" to true, "error" to null)
    } catch (t: Throwable) {
      connectingDeviceId = null
      val error = t.message ?: t.toString()
      emitError("CONNECT_FAILED", error)
      emitConnection("disconnected", deviceId, "failed", error)
      mapOf("ok" to false, "error" to error)
    }
  }

  private fun disconnectInternal(): Map<String, Any?> {
    val deviceId = connectedDeviceId ?: connectingDeviceId
    log("disconnect requested deviceId=${deviceId ?: "none"}")
    if (deviceId == null) {
      return mapOf("ok" to true, "error" to null)
    }

    val device = resolveDevice(deviceId)
    if (device == null) {
      connectedDeviceId = null
      connectingDeviceId = null
      emitConnection("disconnected", deviceId, "manual", null)
      return mapOf("ok" to true, "error" to null)
    }

    return try {
      manualDisconnect = true
      emitConnection("disconnecting", deviceId, "manual", null)
      device.requestDisconnection()
      log("requestDisconnection issued id=$deviceId")
      mapOf("ok" to true, "error" to null)
    } catch (t: Throwable) {
      manualDisconnect = false
      val error = t.message ?: t.toString()
      emitError("ADAPTER_ERROR", error)
      mapOf("ok" to false, "error" to error)
    }
  }

  private fun maybeEmitConnectedIfReady(device: Device) {
    val deviceId = deviceIdFor(device)
    if (connectingDeviceId != deviceId || !device.isReady) return

    val classified = classify(device)
    if (classified == "OTHER") {
      connectingDeviceId = null
      emitError("CONNECT_FAILED", "Device is not a supported ThermoWorks probe")
      emitConnection("disconnected", deviceId, "failed", "Unsupported type")
      return
    }
    if (classified == "UNKNOWN" && !nameLooksLikeSupportedProbe(device.deviceName)) {
      log("connect waiting: ready but type still UNKNOWN id=$deviceId")
      return
    }

    connectingDeviceId = null
    connectedDeviceId = deviceId
    manualDisconnect = false
    readingSequence = 0
    lastBatteryPercent = null
    lastEmittedReadingKey = null
    log("device ready → connected id=$deviceId")
    emitConnection("connected", deviceId, null, null)
    emitReadingFromDevice(device, "ready")
  }

  private fun handleDisconnection(
    device: Device,
    reason: ThermaLib.ClientCallbacks.DeviceDisconnectionReason?,
    message: String?,
    unexpectedCallback: Boolean
  ) {
    val deviceId = deviceIdFor(device)
    val mapped = mapDisconnectReason(reason)
    log(
      "disconnection id=$deviceId mapped=$mapped manualFlag=$manualDisconnect unexpectedCb=$unexpectedCallback msg=${message ?: "—"}"
    )

    val wasOurs = connectedDeviceId == deviceId || connectingDeviceId == deviceId
    if (!wasOurs) {
      manualDisconnect = false
      return
    }

    connectedDeviceId = null
    connectingDeviceId = null
    readingSequence = 0
    lastBatteryPercent = null
    lastEmittedReadingKey = null
    val wasManual = manualDisconnect || mapped == "manual"
    manualDisconnect = false
    emitConnection(
      "disconnected",
      deviceId,
      if (wasManual) "manual" else mapped,
      message
    )
  }

  private fun mapDisconnectReason(
    reason: ThermaLib.ClientCallbacks.DeviceDisconnectionReason?
  ): String {
    if (manualDisconnect) return "manual"
    return when (reason) {
      ThermaLib.ClientCallbacks.DeviceDisconnectionReason.USER -> "manual"
      ThermaLib.ClientCallbacks.DeviceDisconnectionReason.SHUTDOWN -> "shutdown"
      ThermaLib.ClientCallbacks.DeviceDisconnectionReason.NO_BLUETOOTH -> "no_bluetooth"
      ThermaLib.ClientCallbacks.DeviceDisconnectionReason.AUTHENTICATION_FAIL -> "auth"
      ThermaLib.ClientCallbacks.DeviceDisconnectionReason.CONNECTION_TIMEOUT -> "timeout"
      ThermaLib.ClientCallbacks.DeviceDisconnectionReason.UNEXPECTED -> "unexpected"
      else -> if (manualDisconnect) "manual" else "unknown"
    }
  }

  private fun resolveDevice(deviceId: String): Device? {
    devicesById[deviceId]?.let { return it }
    val context = appContext.reactContext ?: return null
    return try {
      val transportId =
        if (deviceId.startsWith("tw:")) deviceId.removePrefix("tw:") else deviceId
      val found =
        ThermaLib.instance(context.applicationContext)
          .getDeviceWithIdentifierAndTransport(transportId, ThermaLib.Transport.BLUETOOTH_LE)
      if (found != null) {
        devicesById[deviceId] = found
      }
      found
    } catch (t: Throwable) {
      log("resolveDevice failed: ${t.message}")
      null
    }
  }

  private fun shutdownDiscovery() {
    log("shutdownDiscovery")
    try {
      val context = appContext.reactContext
      if (context != null) {
        val lib = ThermaLib.instance(context.applicationContext)
        if (scanning) {
          lib.stopScanForDevices()
        }
        val deviceId = connectedDeviceId ?: connectingDeviceId
        if (deviceId != null) {
          resolveDevice(deviceId)?.requestDisconnection()
        }
        callbackHandle?.let { lib.deregisterCallbacks(it) }
      }
    } catch (t: Throwable) {
      log("shutdownDiscovery exception: ${t.message}")
    }
    scanning = false
    connectedDeviceId = null
    connectingDeviceId = null
    manualDisconnect = false
    readingSequence = 0
    lastBatteryPercent = null
    lastEmittedReadingKey = null
    callbackHandle = null
    emitted.clear()
    pending.clear()
    devicesById.clear()
  }

  private fun deviceIdFor(device: Device): String = "tw:${device.identifier}"

  private fun classify(device: Device): String {
    return when (device.deviceType) {
      DeviceType.PEN_BLUE -> "PEN_BLUE"
      DeviceType.TEMPTEST_BLUE -> "TEMPTEST_BLUE"
      DeviceType.UNKNOWN -> "UNKNOWN"
      else -> "OTHER"
    }
  }

  private fun isSupportedDeviceType(classified: String): Boolean {
    return classified == "PEN_BLUE" || classified == "TEMPTEST_BLUE"
  }

  private fun nameLooksLikeSupportedProbe(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    return name.contains("thermapen", ignoreCase = true) ||
      name.contains("temptest", ignoreCase = true)
  }

  private fun payloadFor(device: Device): Map<String, Any?> {
    val name = device.deviceName?.takeIf { it.isNotBlank() } ?: "ThermoWorks probe"
    return buildMap {
      put("deviceId", deviceIdFor(device))
      put("name", name)
      put("deviceType", classify(device))
      device.serialNumber?.takeIf { it.isNotBlank() }?.let { put("serialNumber", it) }
    }
  }

  private fun processDevice(device: Device, source: String): Boolean {
    val deviceId = deviceIdFor(device)
    devicesById[deviceId] = device
    val classified = classify(device)
    val name = device.deviceName ?: ""
    log("discovery raw source=$source id=$deviceId name=$name type=$classified")

    if (classified == "OTHER") {
      val changed = emitted.remove(deviceId) != null
      pending.remove(deviceId)
      return changed
    }

    if (isSupportedDeviceType(classified)) {
      pending.remove(deviceId)
      emitted[deviceId] = payloadFor(device)
      log("filter KEEP ($classified) id=$deviceId")
      return true
    }

    if (nameLooksLikeSupportedProbe(name)) {
      pending.add(deviceId)
      emitted[deviceId] = payloadFor(device)
      log("filter KEEP provisional (UNKNOWN+name) id=$deviceId")
      return true
    }

    pending.add(deviceId)
    log("filter PENDING (UNKNOWN) id=$deviceId")
    return false
  }

  private fun discoveredList(): List<Map<String, Any?>> =
    emitted.values.sortedBy { it["name"] as? String ?: "" }

  private fun emitDevices() {
    val list = discoveredList()
    log("emit devices count=${list.size}")
    sendEvent(
      "onDevices",
      mapOf(
        "type" to "devices",
        "devices" to list
      )
    )
  }

  private fun emitConnection(
    state: String,
    deviceId: String?,
    reason: String?,
    message: String?
  ) {
    log("connection state=$state deviceId=${deviceId ?: "null"} reason=${reason ?: "—"}")
    sendEvent(
      "onConnection",
      buildMap {
        put("type", "connection")
        put("state", state)
        put("deviceId", deviceId)
        if (reason != null) put("reason", reason)
        if (message != null) put("message", message)
      }
    )
  }

  private fun emitReadingFromDevice(device: Device, source: String) {
    val deviceId = deviceIdFor(device)
    if (connectedDeviceId != deviceId || !device.isReady) return

    val sensors = try {
      device.sensors
    } catch (_: Throwable) {
      emptyList()
    }
    val sensor = sensors.firstOrNull() ?: try {
      device.getSensor(0)
    } catch (_: Throwable) {
      null
    }
    if (sensor == null) {
      log("reading skip source=$source id=$deviceId (no sensor)")
      return
    }

    val raw = sensor.reading
    val isNoValue = raw.isNaN() || abs(raw - Sensor.NO_VALUE) < 0.0001f
    val fault = sensor.isFault
    val status = when {
      fault -> "fault"
      isNoValue -> "unavailable"
      else -> "ok"
    }
    val timestamp = try {
      sensor.readingTimestamp?.time ?: System.currentTimeMillis()
    } catch (_: Throwable) {
      System.currentTimeMillis()
    }

    val celsius = if (!isNoValue && !fault) raw else null
    val dedupeKey = "$deviceId|$celsius|$status|$timestamp"
    if (dedupeKey == lastEmittedReadingKey && source == "onDeviceUpdated") {
      return
    }
    lastEmittedReadingKey = dedupeKey
    readingSequence += 1

    val battery = lastBatteryPercent ?: try {
      device.batteryLevel
    } catch (_: Throwable) {
      null
    }
    if (battery != null) {
      lastBatteryPercent = battery
    }

    val payload = buildMap<String, Any?> {
      put("type", "reading")
      put("deviceId", deviceId)
      put("sensorId", "0")
      put("temperatureC", celsius)
      put("timestamp", timestamp)
      put("sequence", readingSequence)
      put("status", status)
      if (battery != null) put("battery", battery)
      put(
        "raw",
        mapOf(
          "isReady" to device.isReady,
          "isFault" to fault,
          "source" to source
        )
      )
    }
    log(
      "reading deviceId=$deviceId celsius=${celsius ?: "null"} status=$status seq=$readingSequence battery=${battery ?: "—"} source=$source"
    )
    sendEvent("onReading", payload)
  }

  private fun emitButtonPress(deviceId: String, timestamp: Long) {
    val ms = if (timestamp > 0L) timestamp else System.currentTimeMillis()
    log("buttonPress deviceId=$deviceId")
    sendEvent(
      "onButtonPress",
      mapOf(
        "type" to "buttonPress",
        "deviceId" to deviceId,
        "timestamp" to ms
      )
    )
  }

  private fun emitError(code: String, message: String) {
    lastError = message
    log("error code=$code message=$message")
    sendEvent(
      "onError",
      mapOf(
        "type" to "error",
        "code" to code,
        "message" to message
      )
    )
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

  private fun vendorAarPresent(): Boolean {
    return try {
      Class.forName("uk.co.etiltd.thermalib.ThermaLib")
      true
    } catch (_: ClassNotFoundException) {
      false
    }
  }

  private fun log(message: String) {
    Log.d(LOG_TAG, message)
  }

  companion object {
    private const val LOG_TAG = "AlenioThermoworks"
    private const val SCAN_TIMEOUT_SEC = 10
    private const val REQUEST_CODE_BT = 0xA7B0
  }
}
