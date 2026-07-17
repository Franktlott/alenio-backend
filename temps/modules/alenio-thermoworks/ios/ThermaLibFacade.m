#import "ThermaLibFacade.h"
#import "ThermaLib/ThermaLib.h"

@implementation ThermaLibFacade

static BOOL _initialized = NO;

+ (BOOL)isLinked {
  return YES;
}

+ (NSDictionary<NSString *, id> *)initializeSdk {
  @try {
    ThermaLib *lib = [ThermaLib sharedInstance];
    if (lib == nil) {
      _initialized = NO;
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
    return @{
      @"ok": @YES,
      @"sdkVersion": version,
      @"bluetoothAvailable": @(ble),
    };
  } @catch (NSException *exception) {
    _initialized = NO;
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

@end
