#import "ThermaLibFacade.h"
#import "ThermaLib/ThermaLib.h"
#import "ThermaLib/TLDevice.h"
#import "ThermaLib/TLSensor.h"
#import "ThermaLib/TLConstants.h"

@implementation ThermaLibFacade

static BOOL _initialized = NO;
static BOOL _scanning = NO;
static BOOL _observersRegistered = NO;
static BOOL _manualDisconnect = NO;
static ThermaLibFacadeDevicesBlock _devicesBlock = nil;
static ThermaLibFacadeErrorBlock _errorBlock = nil;
static ThermaLibFacadeConnectionBlock _connectionBlock = nil;
static ThermaLibFacadeReadingBlock _readingBlock = nil;
static ThermaLibFacadeButtonPressBlock _buttonPressBlock = nil;
static NSMutableDictionary<NSString *, NSDictionary<NSString *, id> *> *_emitted = nil;
static NSMutableDictionary<NSString *, NSNumber *> *_pending = nil;
static NSMutableDictionary<NSString *, id<TLDevice>> *_devicesById = nil;
static NSString *_connectedDeviceId = nil;
static NSString *_connectingDeviceId = nil;
static NSInteger _readingSequence = 0;
static NSNumber *_lastBatteryPercent = nil;

static NSString *const kLogTag = @"AlenioThermoworks";

+ (void)initializeSharedState {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    _emitted = [NSMutableDictionary dictionary];
    _pending = [NSMutableDictionary dictionary];
    _devicesById = [NSMutableDictionary dictionary];
  });
}

+ (void)log:(NSString *)format, ... NS_FORMAT_FUNCTION(1, 2) {
  va_list args;
  va_start(args, format);
  NSString *message = [[NSString alloc] initWithFormat:format arguments:args];
  va_end(args);
  NSLog(@"[%@] %@", kLogTag, message);
}

+ (BOOL)isLinked {
  return YES;
}

+ (NSDictionary<NSString *, id> *)initializeSdk {
  [self initializeSharedState];
  @try {
    ThermaLib *lib = [ThermaLib sharedInstance];
    if (lib == nil) {
      _initialized = NO;
      [self log:@"initializeSdk failed: sharedInstance nil"];
      return @{
        @"ok": @NO,
        @"sdkVersion": @"",
        @"bluetoothAvailable": @NO,
        @"error": @"ThermaLib sharedInstance returned nil",
      };
    }

    NSString *version = [lib versionNumber] ?: @"";
    BOOL ble = [lib isBluetoothAvailable];
    _initialized = YES;
    [self registerObserversIfNeeded];
    [self log:@"initializeSdk ok sdkVersion=%@ bluetoothAvailable=%@", version, ble ? @"YES" : @"NO"];
    return @{
      @"ok": @YES,
      @"sdkVersion": version,
      @"bluetoothAvailable": @(ble),
    };
  } @catch (NSException *exception) {
    _initialized = NO;
    [self log:@"initializeSdk exception: %@", exception.reason ?: @"unknown"];
    return @{
      @"ok": @NO,
      @"sdkVersion": @"",
      @"bluetoothAvailable": @NO,
      @"error": exception.reason ?: @"ThermaLib initialize failed",
    };
  }
}

+ (NSString *)sdkVersion {
  return [[ThermaLib sharedInstance] versionNumber];
}

+ (BOOL)isBluetoothAvailable {
  return [[ThermaLib sharedInstance] isBluetoothAvailable];
}

+ (BOOL)isInitialized {
  return _initialized;
}

+ (BOOL)isScanning {
  return _scanning;
}

+ (NSString *)connectedDeviceId {
  return _connectedDeviceId;
}

+ (void)setDevicesBlock:(ThermaLibFacadeDevicesBlock)block {
  _devicesBlock = [block copy];
}

+ (void)setErrorBlock:(ThermaLibFacadeErrorBlock)block {
  _errorBlock = [block copy];
}

+ (void)setConnectionBlock:(ThermaLibFacadeConnectionBlock)block {
  _connectionBlock = [block copy];
  [self log:@"setConnectionBlock %@", block ? @"installed" : @"cleared"];
}

+ (void)setReadingHandler:(ThermaLibFacadeReadingBlock)handler {
  _readingBlock = [handler copy];
  [self log:@"setReadingHandler %@", handler ? @"installed" : @"cleared"];
}

+ (void)setButtonPressHandler:(ThermaLibFacadeButtonPressBlock)handler {
  _buttonPressBlock = [handler copy];
  [self log:@"setButtonPressHandler %@", handler ? @"installed" : @"cleared"];
}

+ (void)emitErrorCode:(NSString *)code message:(NSString *)message {
  [self log:@"error code=%@ message=%@", code, message];
  if (_errorBlock) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (_errorBlock) {
        _errorBlock(code, message);
      }
    });
  }
}

+ (void)emitConnectionState:(NSString *)state
                   deviceId:(nullable NSString *)deviceId
                     reason:(nullable NSString *)reason
                    message:(nullable NSString *)message {
  NSMutableDictionary *payload = [@{
    @"type": @"connection",
    @"state": state,
  } mutableCopy];
  if (deviceId != nil) {
    payload[@"deviceId"] = deviceId;
  } else {
    payload[@"deviceId"] = [NSNull null];
  }
  if (reason != nil) {
    payload[@"reason"] = reason;
  }
  if (message != nil) {
    payload[@"message"] = message;
  }
  [self log:@"connection state=%@ deviceId=%@ reason=%@ message=%@",
            state, deviceId ?: @"null", reason ?: @"—", message ?: @"—"];
  if (_connectionBlock) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (_connectionBlock) {
        _connectionBlock(payload);
      }
    });
  }
}

+ (void)emitDevices {
  NSArray *list = [self discoveredDevices];
  [self log:@"emit devices count=%lu", (unsigned long)list.count];
  if (_devicesBlock) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (_devicesBlock) {
        _devicesBlock(list);
      }
    });
  }
}

+ (NSArray<NSDictionary<NSString *, id> *> *)discoveredDevices {
  [self initializeSharedState];
  return [_emitted.allValues sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    return [((NSString *)a[@"name"] ?: @"") compare:((NSString *)b[@"name"] ?: @"")];
  }];
}

+ (NSString *)deviceIdForDevice:(id<TLDevice>)device {
  NSString *identifier = device.deviceIdentifier ?: @"";
  return [NSString stringWithFormat:@"tw:%@", identifier];
}

+ (NSString *)transportIdFromDeviceId:(NSString *)deviceId {
  if ([deviceId hasPrefix:@"tw:"]) {
    return [deviceId substringFromIndex:3];
  }
  return deviceId;
}

+ (NSString *)classifyDeviceType:(id<TLDevice>)device {
  TLDeviceType type = device.deviceType;
  if (type == TLDeviceTypeThermaPenBlue) {
    return @"PEN_BLUE";
  }
  if (type == TLDeviceTypeTempTestBlue) {
    return @"TEMPTEST_BLUE";
  }
  if (type == TLDeviceTypeUnknown) {
    return @"UNKNOWN";
  }
  return @"OTHER";
}

+ (BOOL)isSupportedDeviceType:(NSString *)classified {
  return [classified isEqualToString:@"PEN_BLUE"] || [classified isEqualToString:@"TEMPTEST_BLUE"];
}

+ (BOOL)nameLooksLikeSupportedProbe:(NSString *)name {
  if (name.length == 0) {
    return NO;
  }
  if ([name rangeOfString:@"thermapen" options:NSCaseInsensitiveSearch].location != NSNotFound) {
    return YES;
  }
  return [name rangeOfString:@"temptest" options:NSCaseInsensitiveSearch].location != NSNotFound;
}

+ (NSDictionary<NSString *, id> *)payloadForDevice:(id<TLDevice>)device {
  NSString *deviceId = [self deviceIdForDevice:device];
  NSString *name = device.deviceName.length > 0 ? device.deviceName : (device.deviceTypeName ?: @"ThermoWorks probe");
  NSMutableDictionary *payload = [@{
    @"deviceId": deviceId,
    @"name": name,
    @"deviceType": [self classifyDeviceType:device],
  } mutableCopy];
  if (device.serialNumber.length > 0) {
    payload[@"serialNumber"] = device.serialNumber;
  }
  if (device.rssi != nil) {
    payload[@"rssi"] = device.rssi;
  }
  return payload;
}

+ (BOOL)processDevice:(id<TLDevice>)device source:(NSString *)source {
  [self initializeSharedState];
  if (device == nil) {
    return NO;
  }

  NSString *deviceId = [self deviceIdForDevice:device];
  _devicesById[deviceId] = device;

  NSString *classified = [self classifyDeviceType:device];
  NSString *name = device.deviceName ?: @"";
  [self log:@"discovery raw source=%@ id=%@ name=%@ type=%@ sdkType=%ld ready=%@",
            source, deviceId, name, classified, (long)device.deviceType, device.ready ? @"YES" : @"NO"];

  if ([classified isEqualToString:@"OTHER"]) {
    BOOL changed = _emitted[deviceId] != nil;
    [_emitted removeObjectForKey:deviceId];
    [_pending removeObjectForKey:deviceId];
    [self log:changed ? @"filter DROP (OTHER, was emitted) id=%@" : @"filter DROP (OTHER) id=%@", deviceId];
    return changed;
  }

  if ([self isSupportedDeviceType:classified]) {
    [_pending removeObjectForKey:deviceId];
    _emitted[deviceId] = [self payloadForDevice:device];
    [self log:@"filter KEEP (%@) id=%@", classified, deviceId];
    return YES;
  }

  BOOL provisional = [self nameLooksLikeSupportedProbe:name];
  if (provisional) {
    _pending[deviceId] = @YES;
    _emitted[deviceId] = [self payloadForDevice:device];
    [self log:@"filter KEEP provisional (UNKNOWN+name) id=%@", deviceId];
    return YES;
  }

  _pending[deviceId] = @YES;
  [self log:@"filter PENDING (UNKNOWN) id=%@", deviceId];
  return NO;
}

+ (nullable id<TLDevice>)resolveDevice:(NSString *)deviceId {
  [self initializeSharedState];
  id<TLDevice> cached = _devicesById[deviceId];
  if (cached != nil) {
    return cached;
  }
  NSString *transportId = [self transportIdFromDeviceId:deviceId];
  @try {
    id<TLDevice> found = [[ThermaLib sharedInstance] deviceWithIdentifier:transportId
                                                                transport:TLTransportBluetoothLE];
    if (found != nil) {
      _devicesById[deviceId] = found;
    }
    return found;
  } @catch (__unused NSException *exception) {
    return nil;
  }
}

+ (NSString *)mapDisconnectReason:(TLDeviceDisconnectionReason)reason {
  if (_manualDisconnect) {
    return @"manual";
  }
  switch (reason) {
    case TLDeviceDisconnectionReasonUser:
      return @"manual";
    case TLDeviceDisconnectionReasonDeviceShutDown:
      return @"shutdown";
    case TLDeviceDisconnectionReasonNoBluetooth:
      return @"no_bluetooth";
    case TLDeviceDisconnectionReasonAuthenticationFailure:
      return @"auth";
    case TLDeviceDisconnectionReasonUnexpected:
      return @"unexpected";
    default:
      return @"unknown";
  }
}

+ (void)emitReadingPayload:(NSDictionary<NSString *, id> *)payload {
  [self log:@"reading deviceId=%@ celsius=%@ status=%@ seq=%@ battery=%@",
            payload[@"deviceId"],
            payload[@"temperatureC"] ?: @"null",
            payload[@"status"],
            payload[@"sequence"] ?: @"—",
            payload[@"battery"] ?: @"—"];
  if (_readingBlock) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (_readingBlock) {
        _readingBlock(payload);
      }
    });
  }
}

+ (void)emitButtonPressForDeviceId:(NSString *)deviceId {
  NSTimeInterval ms = [[NSDate date] timeIntervalSince1970] * 1000.0;
  NSDictionary *payload = @{
    @"type": @"buttonPress",
    @"deviceId": deviceId,
    @"timestamp": @((long long)ms),
  };
  [self log:@"buttonPress deviceId=%@", deviceId];
  if (_buttonPressBlock) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (_buttonPressBlock) {
        _buttonPressBlock(payload);
      }
    });
  }
}

+ (void)emitReadingFromDevice:(id<TLDevice>)device source:(NSString *)source {
  if (device == nil || !device.ready) {
    return;
  }
  NSString *deviceId = [self deviceIdForDevice:device];
  if (_connectedDeviceId == nil || ![_connectedDeviceId isEqualToString:deviceId]) {
    return;
  }

  id<TLSensor> sensor = nil;
  @try {
    sensor = [device sensorAtIndex:1];
  } @catch (__unused NSException *exception) {
    sensor = nil;
  }
  if (sensor == nil && device.sensors.count > 0) {
    sensor = device.sensors.firstObject;
  }
  if (sensor == nil) {
    [self log:@"reading skip source=%@ id=%@ (no sensor)", source, deviceId];
    return;
  }

  float raw = sensor.reading;
  float noValue = TLConstants.NO_VALUE;
  BOOL isNoValue = isnan(raw) || fabsf(raw - noValue) < 0.0001f;
  BOOL fault = sensor.fault;
  NSString *status = fault ? @"fault" : (isNoValue ? @"unavailable" : @"ok");
  _readingSequence += 1;

  NSTimeInterval ts = sensor.readingTimestamp != nil
    ? [sensor.readingTimestamp timeIntervalSince1970] * 1000.0
    : ([[NSDate date] timeIntervalSince1970] * 1000.0);

  NSMutableDictionary *payload = [@{
    @"type": @"reading",
    @"deviceId": deviceId,
    @"sensorId": [NSString stringWithFormat:@"%lu", (unsigned long)sensor.index],
    @"timestamp": @((long long)ts),
    @"sequence": @(_readingSequence),
    @"status": status,
    @"raw": @{
      @"isReady": @(device.ready),
      @"isFault": @(fault),
      @"source": source,
    },
  } mutableCopy];

  if (!isNoValue && !fault) {
    payload[@"temperatureC"] = @(raw);
  } else {
    payload[@"temperatureC"] = [NSNull null];
  }
  if (_lastBatteryPercent != nil) {
    payload[@"battery"] = _lastBatteryPercent;
  } else {
    payload[@"battery"] = @(device.batteryLevel);
    _lastBatteryPercent = payload[@"battery"];
  }

  [self emitReadingPayload:payload];
}

+ (void)registerObserversIfNeeded {
  if (_observersRegistered) {
    return;
  }
  NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
  [center addObserver:self selector:@selector(handleNewDevice:) name:ThermaLibNewDeviceFoundNotificationName object:nil];
  [center addObserver:self selector:@selector(handleDeviceUpdated:) name:ThermaLibDeviceUpdatedNotificationName object:nil];
  [center addObserver:self selector:@selector(handleScanCompleted:) name:ThermaLibScanCompletedNotificationName object:nil];
  [center addObserver:self selector:@selector(handleDisconnection:) name:ThermaLibDeviceDisconnectionNotificationName object:nil];
  [center addObserver:self selector:@selector(handleSensorUpdated:) name:ThermaLibSensorUpdatedNotificationName object:nil];
  [center addObserver:self selector:@selector(handleBatteryLevel:) name:ThermaLibBatteryLevelNotificationName object:nil];
  [center addObserver:self
             selector:@selector(handleDeviceNotification:)
                 name:ThermaLibNotificationReceivedNotificationName
               object:nil];
  _observersRegistered = YES;
  [self log:@"NSNotification observers registered (incl. sensor/battery/button)"];
}

+ (void)handleNewDevice:(NSNotification *)notification {
  id object = notification.object;
  if (![object conformsToProtocol:@protocol(TLDevice)]) {
    return;
  }
  if ([self processDevice:(id<TLDevice>)object source:@"NewDeviceFound"]) {
    [self emitDevices];
  }
}

+ (void)handleDeviceUpdated:(NSNotification *)notification {
  id object = notification.object;
  if (![object conformsToProtocol:@protocol(TLDevice)]) {
    return;
  }
  id<TLDevice> device = (id<TLDevice>)object;
  NSString *deviceId = [self deviceIdForDevice:device];
  _devicesById[deviceId] = device;

  BOOL interested = _pending[deviceId] != nil || _emitted[deviceId] != nil || _scanning ||
                    [_connectingDeviceId isEqualToString:deviceId] ||
                    [_connectedDeviceId isEqualToString:deviceId];
  if (!interested) {
    return;
  }

  BOOL changed = [self processDevice:device source:@"DeviceUpdated"];
  if (changed) {
    [self emitDevices];
  }

  // Connected only when ThermaLib reports ready (settings loaded).
  if ([_connectingDeviceId isEqualToString:deviceId] && device.ready) {
    NSString *classified = [self classifyDeviceType:device];
    if (![self isSupportedDeviceType:classified] && ![classified isEqualToString:@"UNKNOWN"]) {
      [self log:@"connect rejected after ready: type=%@", classified];
      _connectingDeviceId = nil;
      [self emitErrorCode:@"CONNECT_FAILED" message:@"Device is not a supported ThermoWorks probe"];
      [self emitConnectionState:@"disconnected" deviceId:deviceId reason:@"failed" message:@"Unsupported type"];
      return;
    }
    // Prefer confirming supported type; allow ready provisional if type still UNKNOWN but name matched.
    if ([classified isEqualToString:@"UNKNOWN"] && ![self nameLooksLikeSupportedProbe:device.deviceName ?: @""]) {
      [self log:@"connect waiting: ready but type still UNKNOWN id=%@", deviceId];
      return;
    }
    _connectingDeviceId = nil;
    _connectedDeviceId = deviceId;
    _manualDisconnect = NO;
    _readingSequence = 0;
    _lastBatteryPercent = nil;
    [self log:@"device ready → connected id=%@", deviceId];
    [self emitConnectionState:@"connected" deviceId:deviceId reason:nil message:nil];
    [self emitReadingFromDevice:device source:@"ready"];
  } else if ([_connectedDeviceId isEqualToString:deviceId] && device.ready) {
    [self emitReadingFromDevice:device source:@"DeviceUpdated"];
  }
}

+ (void)handleSensorUpdated:(NSNotification *)notification {
  id object = notification.object;
  if (![object conformsToProtocol:@protocol(TLSensor)]) {
    return;
  }
  id<TLSensor> sensor = (id<TLSensor>)object;
  id<TLDevice> device = sensor.device;
  if (device == nil) {
    return;
  }
  [self emitReadingFromDevice:device source:@"SensorUpdated"];
}

+ (void)handleBatteryLevel:(NSNotification *)notification {
  id object = notification.object;
  if (![object conformsToProtocol:@protocol(TLDevice)]) {
    return;
  }
  id<TLDevice> device = (id<TLDevice>)object;
  NSString *deviceId = [self deviceIdForDevice:device];
  if (_connectedDeviceId == nil || ![_connectedDeviceId isEqualToString:deviceId]) {
    return;
  }
  _lastBatteryPercent = @(device.batteryLevel);
  [self log:@"battery id=%@ level=%ld", deviceId, (long)device.batteryLevel];
  [self emitReadingFromDevice:device source:@"BatteryLevel"];
}

+ (void)handleDeviceNotification:(NSNotification *)notification {
  id object = notification.object;
  if (![object conformsToProtocol:@protocol(TLDevice)]) {
    return;
  }
  id<TLDevice> device = (id<TLDevice>)object;
  NSString *deviceId = [self deviceIdForDevice:device];
  NSNumber *typeNum = notification.userInfo[ThermaLibNotificationReceivedNotificationTypeKey];
  TLDeviceNotificationType type = typeNum != nil
    ? (TLDeviceNotificationType)typeNum.integerValue
    : TLDeviceNotificationTypeNone;
  [self log:@"deviceNotification id=%@ type=%ld", deviceId, (long)type];
  if (type != TLDeviceNotificationTypeButtonPressed) {
    return;
  }
  if (_connectedDeviceId == nil || ![_connectedDeviceId isEqualToString:deviceId]) {
    [self log:@"buttonPress ignored (not connected device) id=%@", deviceId];
    return;
  }
  // Button often accompanies a fresh sample — emit reading first, then capture signal.
  [self emitReadingFromDevice:device source:@"ButtonPressed"];
  [self emitButtonPressForDeviceId:deviceId];
}

+ (void)handleScanCompleted:(NSNotification *)notification {
  _scanning = NO;
  [self log:@"scan completed; emittedCount=%lu", (unsigned long)_emitted.count];
  [self emitDevices];
}

+ (void)handleDisconnection:(NSNotification *)notification {
  id object = notification.object;
  if (![object conformsToProtocol:@protocol(TLDevice)]) {
    return;
  }
  id<TLDevice> device = (id<TLDevice>)object;
  NSString *deviceId = [self deviceIdForDevice:device];
  NSNumber *reasonNum = notification.userInfo[ThermaLibDeviceDisconnectionNotificationReasonKey];
  TLDeviceDisconnectionReason sdkReason = reasonNum != nil
    ? (TLDeviceDisconnectionReason)reasonNum.integerValue
    : TLDeviceDisconnectionReasonUnknown;
  NSString *reason = [self mapDisconnectReason:sdkReason];
  [self log:@"disconnection id=%@ sdkReason=%ld mapped=%@ manualFlag=%@",
            deviceId, (long)sdkReason, reason, _manualDisconnect ? @"YES" : @"NO"];

  BOOL wasOurs = [_connectedDeviceId isEqualToString:deviceId] ||
                 [_connectingDeviceId isEqualToString:deviceId];
  if (!wasOurs) {
    _manualDisconnect = NO;
    return;
  }

  _connectedDeviceId = nil;
  _connectingDeviceId = nil;
  _readingSequence = 0;
  _lastBatteryPercent = nil;
  BOOL wasManual = _manualDisconnect || [reason isEqualToString:@"manual"];
  _manualDisconnect = NO;
  NSString *finalReason = wasManual ? @"manual" : reason;
  [self emitConnectionState:@"disconnected"
                   deviceId:deviceId
                     reason:finalReason
                    message:nil];
}

+ (NSDictionary<NSString *, id> *)startScan {
  [self initializeSharedState];
  [self log:@"startScan requested"];

  if (!_initialized) {
    NSDictionary *initResult = [self initializeSdk];
    if (![(NSNumber *)initResult[@"ok"] boolValue]) {
      NSString *error = initResult[@"error"] ?: @"ThermaLib not initialized";
      [self emitErrorCode:@"SCAN_FAILED" message:error];
      return @{ @"ok": @NO, @"error": error };
    }
  }

  if (![self isBluetoothAvailable]) {
    NSString *error = @"Bluetooth is not available";
    [self emitErrorCode:@"SCAN_FAILED" message:error];
    return @{ @"ok": @NO, @"error": error };
  }

  @try {
    [self registerObserversIfNeeded];
    [_emitted removeAllObjects];
    [_pending removeAllObjects];
    [self emitDevices];

    [[ThermaLib sharedInstance] startDeviceScanWithTransport:TLTransportBluetoothLE
                                   retrieveSystemConnections:NO];
    _scanning = YES;
    [self log:@"startScan started"];
    return @{ @"ok": @YES };
  } @catch (NSException *exception) {
    _scanning = NO;
    NSString *error = exception.reason ?: @"startScan failed";
    [self emitErrorCode:@"SCAN_FAILED" message:error];
    return @{ @"ok": @NO, @"error": error };
  }
}

+ (NSDictionary<NSString *, id> *)stopScan {
  [self log:@"stopScan requested scanning=%@", _scanning ? @"YES" : @"NO"];
  @try {
    [[ThermaLib sharedInstance] stopDeviceScan];
    _scanning = NO;
    return @{ @"ok": @YES };
  } @catch (NSException *exception) {
    NSString *error = exception.reason ?: @"stopScan failed";
    [self emitErrorCode:@"SCAN_FAILED" message:error];
    return @{ @"ok": @NO, @"error": error };
  }
}

+ (NSDictionary<NSString *, id> *)connect:(NSString *)deviceId {
  [self initializeSharedState];
  [self log:@"connect requested deviceId=%@", deviceId];

  if (!_initialized) {
    NSDictionary *initResult = [self initializeSdk];
    if (![(NSNumber *)initResult[@"ok"] boolValue]) {
      NSString *error = initResult[@"error"] ?: @"ThermaLib not initialized";
      [self emitErrorCode:@"CONNECT_FAILED" message:error];
      return @{ @"ok": @NO, @"error": error };
    }
  }

  id<TLDevice> device = [self resolveDevice:deviceId];
  if (device == nil) {
    NSString *error = [NSString stringWithFormat:@"Unknown device: %@", deviceId];
    [self emitErrorCode:@"CONNECT_FAILED" message:error];
    return @{ @"ok": @NO, @"error": error };
  }

  NSString *classified = [self classifyDeviceType:device];
  if ([classified isEqualToString:@"OTHER"]) {
    NSString *error = @"Device is not a supported ThermoWorks probe";
    [self emitErrorCode:@"CONNECT_FAILED" message:error];
    return @{ @"ok": @NO, @"error": error };
  }

  @try {
    // Stop scan while connecting (matches typical ThermaLib sample UX).
    if (_scanning) {
      [[ThermaLib sharedInstance] stopDeviceScan];
      _scanning = NO;
    }

    _manualDisconnect = NO;
    _connectingDeviceId = deviceId;
    _connectedDeviceId = nil;
    [self emitConnectionState:@"connecting" deviceId:deviceId reason:nil message:nil];

    if (device.ready) {
      _connectingDeviceId = nil;
      _connectedDeviceId = deviceId;
      _readingSequence = 0;
      _lastBatteryPercent = nil;
      [self log:@"connect: already ready id=%@", deviceId];
      [self emitConnectionState:@"connected" deviceId:deviceId reason:nil message:nil];
      [self emitReadingFromDevice:device source:@"connectAlreadyReady"];
      return @{ @"ok": @YES };
    }

    [[ThermaLib sharedInstance] connectToDevice:device];
    [self log:@"connectToDevice issued id=%@", deviceId];
    return @{ @"ok": @YES };
  } @catch (NSException *exception) {
    _connectingDeviceId = nil;
    NSString *error = exception.reason ?: @"connect failed";
    [self emitErrorCode:@"CONNECT_FAILED" message:error];
    [self emitConnectionState:@"disconnected" deviceId:deviceId reason:@"failed" message:error];
    return @{ @"ok": @NO, @"error": error };
  }
}

+ (NSDictionary<NSString *, id> *)disconnect {
  NSString *deviceId = _connectedDeviceId ?: _connectingDeviceId;
  [self log:@"disconnect requested deviceId=%@", deviceId ?: @"none"];

  if (deviceId == nil) {
    return @{ @"ok": @YES };
  }

  id<TLDevice> device = [self resolveDevice:deviceId];
  if (device == nil) {
    _connectedDeviceId = nil;
    _connectingDeviceId = nil;
    [self emitConnectionState:@"disconnected" deviceId:deviceId reason:@"manual" message:nil];
    return @{ @"ok": @YES };
  }

  @try {
    _manualDisconnect = YES;
    [self emitConnectionState:@"disconnecting" deviceId:deviceId reason:@"manual" message:nil];
    // SDK API spelling is intentionally "disconect".
    [[ThermaLib sharedInstance] disconectFromDevice:device];
    [self log:@"disconectFromDevice issued id=%@", deviceId];
    return @{ @"ok": @YES };
  } @catch (NSException *exception) {
    _manualDisconnect = NO;
    NSString *error = exception.reason ?: @"disconnect failed";
    [self emitErrorCode:@"ADAPTER_ERROR" message:error];
    return @{ @"ok": @NO, @"error": error };
  }
}

+ (void)shutdownDiscovery {
  [self log:@"shutdownDiscovery"];
  @try {
    if (_scanning) {
      [[ThermaLib sharedInstance] stopDeviceScan];
    }
    NSString *deviceId = _connectedDeviceId ?: _connectingDeviceId;
    if (deviceId != nil) {
      id<TLDevice> device = [self resolveDevice:deviceId];
      if (device != nil) {
        _manualDisconnect = YES;
        [[ThermaLib sharedInstance] disconectFromDevice:device];
      }
    }
  } @catch (__unused NSException *exception) {
  }
  _scanning = NO;
  _connectedDeviceId = nil;
  _connectingDeviceId = nil;
  _manualDisconnect = NO;
  _readingSequence = 0;
  _lastBatteryPercent = nil;
  if (_observersRegistered) {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    _observersRegistered = NO;
  }
  [_emitted removeAllObjects];
  [_pending removeAllObjects];
  [_devicesById removeAllObjects];
  _devicesBlock = nil;
  _errorBlock = nil;
  _connectionBlock = nil;
  _readingBlock = nil;
  _buttonPressBlock = nil;
}

@end
