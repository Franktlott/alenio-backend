#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ThermaLibFacade : NSObject

+ (BOOL)isLinked;
/// Returns @{ @"ok": NSNumber, @"sdkVersion": NSString, @"bluetoothAvailable": NSNumber, @"error": NSString? }
+ (NSDictionary<NSString *, id> *)initializeSdk;
+ (nullable NSString *)sdkVersion;
+ (BOOL)isBluetoothAvailable;
+ (BOOL)isInitialized;

@end

NS_ASSUME_NONNULL_END
