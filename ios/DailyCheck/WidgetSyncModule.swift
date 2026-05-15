import Foundation
import WidgetKit

@objc(WidgetSyncModule)
final class WidgetSyncModule: NSObject {
  private let suiteName = "group.com.bgl0819.timepillv3.shared"
  private let snapshotKey = "routineWidgetSnapshot"
  private let widgetKind = "RoutineHomeWidget"

  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(setRoutineWidgetSnapshot:resolver:rejecter:)
  func setRoutineWidgetSnapshot(
    _ snapshotJson: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: suiteName) else {
      reject("E_WIDGET_SYNC", "Shared app group is unavailable.", nil)
      return
    }

    defaults.set(snapshotJson, forKey: snapshotKey)
    defaults.set(Date().timeIntervalSince1970, forKey: "\(snapshotKey)UpdatedAt")
    resolve(nil)
  }

  @objc(reloadRoutineWidgetTimelines:rejecter:)
  func reloadRoutineWidgetTimelines(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }
}
