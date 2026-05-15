#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetSyncModule, NSObject)

RCT_EXTERN_METHOD(setRoutineWidgetSnapshot:(NSString *)snapshotJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reloadRoutineWidgetTimelines:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
