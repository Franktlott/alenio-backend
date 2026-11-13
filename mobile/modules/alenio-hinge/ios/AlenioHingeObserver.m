#import "AlenioHingeObserver.h"

@implementation AlenioHingeObserver {
  id _interaction;
  __weak UIView *_view;
  AlenioHingeUpdateBlock _update;
}

- (void)startOnView:(UIView *)view update:(AlenioHingeUpdateBlock)update {
  [self stop];
  _view = view;
  _update = [update copy];

#if defined(__IPHONE_27_1) && __IPHONE_OS_VERSION_MAX_ALLOWED >= __IPHONE_27_1
  if (@available(iOS 27.1, *)) {
    __weak __typeof(self) weakSelf = self;
    UIHingeInteraction *interaction =
        [[UIHingeInteraction alloc] initWithUpdateHandler:^(UIHingeInteraction *_, UIHingeInteractionUpdate *change) {
          __strong __typeof(weakSelf) strongSelf = weakSelf;
          if (!strongSelf || strongSelf->_update == nil) {
            return;
          }
          UIHinge *hinge = change.hinge;
          if (hinge == nil) {
            strongSelf->_update(@"unknown", nil);
            return;
          }
          NSString *status = @"unknown";
          switch (hinge.status) {
            case UIHingeStatusClosed:
              status = @"closed";
              break;
            case UIHingeStatusPartiallyOpen:
              status = @"partiallyOpen";
              break;
            case UIHingeStatusFullyOpen:
              status = @"fullyOpen";
              break;
            case UIHingeStatusUnknown:
            default:
              status = @"unknown";
              break;
          }
          strongSelf->_update(status, @(hinge.angle));
        }];
    [view addInteraction:interaction];
    _interaction = interaction;
    return;
  }
#endif
  if (_update) {
    _update(@"unknown", nil);
  }
}

- (void)stop {
  if (_view != nil && _interaction != nil) {
    [_view removeInteraction:_interaction];
  }
  _interaction = nil;
  _view = nil;
  _update = nil;
}

@end
