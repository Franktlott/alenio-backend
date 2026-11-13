#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^AlenioHingeUpdateBlock)(NSString *status, NSNumber *_Nullable angle);

@interface AlenioHingeObserver : NSObject

- (void)startOnView:(UIView *)view update:(AlenioHingeUpdateBlock)update;
- (void)stop;

@end

NS_ASSUME_NONNULL_END
