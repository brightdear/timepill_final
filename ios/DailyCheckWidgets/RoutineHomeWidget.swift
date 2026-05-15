import SwiftUI
import WidgetKit

private let appGroupId = "group.com.bgl0819.timepillv3.shared"
private let snapshotKey = "routineWidgetSnapshot"
private let widgetKind = "RoutineHomeWidget"

private struct SharedRoutineWidgetSnapshot: Codable {
  struct SmallPayload: Codable {
    let title: String
    let primary: String
    let secondary: String
  }

  struct TimelineItemPayload: Codable, Identifiable {
    let id: String
    let label: String
    let timeLabel: String
    let statusLabel: String
    let state: String
  }

  struct MediumPayload: Codable {
    let title: String
    let progress: String
    let next: String
    let items: [TimelineItemPayload]
  }

  let state: String
  let pendingCount: Int
  let completedCount: Int
  let totalCount: Int
  let nextTimeLabel: String?
  let small: SmallPayload
  let medium: MediumPayload
}

private struct RoutineWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: SharedRoutineWidgetSnapshot
  let lastUpdated: Date?
}

private enum SnapshotStore {
  static func load() -> SharedRoutineWidgetSnapshot {
    guard
      let defaults = UserDefaults(suiteName: appGroupId),
      let rawValue = defaults.string(forKey: snapshotKey),
      let data = rawValue.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(SharedRoutineWidgetSnapshot.self, from: data)
    else {
      return fallbackSnapshot()
    }

    return snapshot
  }

  static func lastUpdated() -> Date? {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return nil
    }
    let timestamp = defaults.double(forKey: "\(snapshotKey)UpdatedAt")
    guard timestamp > 0 else { return nil }
    return Date(timeIntervalSince1970: timestamp)
  }

  static func fallbackSnapshot() -> SharedRoutineWidgetSnapshot {
    SharedRoutineWidgetSnapshot(
      state: "upcoming",
      pendingCount: 0,
      completedCount: 0,
      totalCount: 0,
      nextTimeLabel: nil,
      small: .init(
        title: "오늘",
        primary: "일정 없음",
        secondary: "앱에서 약을 등록해 보세요"
      ),
      medium: .init(
        title: "오늘",
        progress: "0 / 0 완료",
        next: "앱에서 일정 추가",
        items: []
      )
    )
  }
}

private struct RoutineWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> RoutineWidgetEntry {
    RoutineWidgetEntry(date: .now, snapshot: SnapshotStore.fallbackSnapshot(), lastUpdated: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (RoutineWidgetEntry) -> Void) {
    completion(
      RoutineWidgetEntry(date: .now, snapshot: SnapshotStore.load(), lastUpdated: SnapshotStore.lastUpdated())
    )
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<RoutineWidgetEntry>) -> Void) {
    let entry = RoutineWidgetEntry(
      date: .now,
      snapshot: SnapshotStore.load(),
      lastUpdated: SnapshotStore.lastUpdated()
    )
    let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
  }
}

private struct RoutineWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: RoutineWidgetEntry

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 1.0, green: 0.97, blue: 0.92), Color(red: 0.93, green: 0.97, blue: 1.0)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      switch family {
      case .systemMedium:
        MediumRoutineWidgetView(entry: entry)
      default:
        SmallRoutineWidgetView(entry: entry)
      }
    }
    .widgetURL(URL(string: "timepillv3://local/"))
  }
}

private struct SmallRoutineWidgetView: View {
  let entry: RoutineWidgetEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(entry.snapshot.small.title.uppercased())
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(Color(red: 0.42, green: 0.48, blue: 0.56))

      Spacer(minLength: 0)

      Text(entry.snapshot.small.primary)
        .font(.system(size: 24, weight: .heavy, design: .rounded))
        .foregroundStyle(Color(red: 0.09, green: 0.12, blue: 0.19))
        .minimumScaleFactor(0.7)

      Text(entry.snapshot.small.secondary)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(Color(red: 0.35, green: 0.4, blue: 0.48))
        .lineLimit(2)

      if let lastUpdated = entry.lastUpdated {
        Text(lastUpdated, style: .time)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(Color(red: 0.47, green: 0.55, blue: 0.67))
      }
    }
    .padding(16)
  }
}

private struct MediumRoutineWidgetView: View {
  let entry: RoutineWidgetEntry

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      VStack(alignment: .leading, spacing: 10) {
        Text(entry.snapshot.medium.title.uppercased())
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(Color(red: 0.42, green: 0.48, blue: 0.56))

        Text(entry.snapshot.medium.progress)
          .font(.system(size: 21, weight: .heavy, design: .rounded))
          .foregroundStyle(Color(red: 0.09, green: 0.12, blue: 0.19))
          .minimumScaleFactor(0.75)

        Text(entry.snapshot.medium.next)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(Color(red: 0.35, green: 0.4, blue: 0.48))
          .lineLimit(2)

        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      VStack(alignment: .leading, spacing: 8) {
        if entry.snapshot.medium.items.isEmpty {
          Text("표시할 일정이 없습니다")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color(red: 0.35, green: 0.4, blue: 0.48))
        } else {
          ForEach(entry.snapshot.medium.items.prefix(3)) { item in
            VStack(alignment: .leading, spacing: 2) {
              Text(item.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color(red: 0.09, green: 0.12, blue: 0.19))
                .lineLimit(1)
              Text("\(item.timeLabel) · \(item.statusLabel)")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color(red: 0.35, green: 0.4, blue: 0.48))
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(16)
  }
}

struct RoutineHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: widgetKind, provider: RoutineWidgetProvider()) { entry in
      RoutineWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("오늘 체크")
    .description("다가오는 복약 일정과 오늘 진행 상태를 홈 화면에서 확인합니다.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct DailyCheckWidgetsBundle: WidgetBundle {
  var body: some Widget {
    RoutineHomeWidget()
  }
}
