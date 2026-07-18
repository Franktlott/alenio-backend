#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^ThermaLibFacadeDevicesBlock)(NSArray<NSDictionary<NSString *, id> *> *devices);
typedef void (^ThermaLibFacadeErrorBlock)(NSString *code, NSString *message);
/// Payload: state, deviceId?, reason?, message?
typedef void (^ThermaLibFacadeConnectionBlock)(NSDictionary<NSString *, id> *event);

@interface ThermaLibFacade : NSObject

+ (BOOL)isLinked;
/// Returns @{ @"ok": NSNumber, @"sdkVersion": NSString, @"bluetoothAvailable": NSNumber, @"error": NSString? }
+ (NSDictionary<NSString *, id> *)initializeSdk;
+ (nullable NSString *)sdkVersion;
+ (BOOL)isBluetoothAvailable;
+ (BOOL)isInitialized;
+ (BOOL)isScanning;
+ (nullable NSString *)connectedDeviceId;

+ (void)setDevicesBlock:(nullable ThermaLibFacadeDevicesBlock)block;
+ (void)setErrorBlock:(nullable ThermaLibFacadeErrorBlock)block;
+ (void)setConnectionBlock:(nullable ThermaLibFacadeConnectionBlock)block;

+ (NSDictionary<NSString *, id> *)startScan;
+ (NSDictionary<NSString *, id> *)stopScan;
+ (NSDictionary<NSString *, id> *)connect:(NSString *)deviceId;
+ (NSDictionary<NSString *, id> *)disconnect;

+ (NSArray<NSDictionary<NSString *, id> *> *)discoveredDevices;

+ (void)shutdownDiscovery;

@end

NS_ASSUME_NONNULL_END
