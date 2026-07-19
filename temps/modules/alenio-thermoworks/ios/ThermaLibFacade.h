#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^ThermaLibFacadeDevicesBlock)(NSArray<NSDictionary<NSString *, id> *> *devices);
typedef void (^ThermaLibFacadeErrorBlock)(NSString *code, NSString *message);
/// Payload: state, deviceId?, reason?, message?
typedef void (^ThermaLibFacadeConnectionBlock)(NSDictionary<NSString *, id> *event);
/// Payload: deviceId, temperatureC?, sensorId?, timestamp, sequence?, battery?, status, raw?
typedef void (^ThermaLibFacadeReadingBlock)(NSDictionary<NSString *, id> *event);
/// Payload: deviceId, timestamp (ms)
typedef void (^ThermaLibFacadeButtonPressBlock)(NSDictionary<NSString *, id> *event);

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
/// Named to avoid Swift importing this as a `reading` property setter.
+ (void)setReadingHandler:(nullable ThermaLibFacadeReadingBlock)handler;
+ (void)setButtonPressHandler:(nullable ThermaLibFacadeButtonPressBlock)handler;

+ (NSDictionary<NSString *, id> *)startScan;
+ (NSDictionary<NSString *, id> *)stopScan;
+ (NSDictionary<NSString *, id> *)connect:(NSString *)deviceId;
+ (NSDictionary<NSString *, id> *)disconnect;

+ (NSArray<NSDictionary<NSString *, id> *> *)discoveredDevices;

+ (void)shutdownDiscovery;

@end

NS_ASSUME_NONNULL_END
