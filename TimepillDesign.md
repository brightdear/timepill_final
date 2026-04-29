# Timepill Design Spec — Registration, Settings, Notification Privacy

## 1. Product Direction

Timepill should not feel like a medical form app. It should feel like a private daily check app.

The current problems are:

1. The Settings tab is too long and scroll-heavy.
2. The Settings tab overlaps with medication registration features.
3. The registration flow is too long.
4. The registration flow asks unnecessary frequency questions even though the default use case is daily medication.
5. Time selection should feel like a native alarm picker, not a generic form.
6. Notification privacy, notification wording, lock screen display, widget display, and reminder strength should be configured together in one focused step.
7. The user should see exactly how the notification will appear before saving.

The new direction:

- Registration should be a short step-based flow.
- Default schedule should be daily.
- Frequency selection should be removed from the main flow.
- Advanced schedule options should be optional and hidden behind “Advanced schedule”.
- Settings should only contain global defaults and app-level controls.
- Per-medication privacy, notification text, reminder strength, and widget behavior should live inside the registration/edit flow.

---

## 2. Global Visual Style

Use the existing app style.

### Visual Language

- Background: warm off-white or near-white.
- Cards: white or very light warm gray.
- Primary text: near-black navy.
- Secondary text: gray.
- Primary action: orange.
- Selected chip/card: near-black navy with white text, or soft orange when appropriate.
- Unselected chip/card: light gray.
- Design should feel calm, private, and routine-oriented.
- Avoid medical imagery.

### Forbidden Visual Elements

Do not use:

- Pill icons
- Capsule icons
- Hospital icons
- Cross icons
- Syringe icons
- Pharmacy icons
- Medicine bottle icons
- 💊 emoji

### Recommended Icon Language

Use only neutral symbols:

- Check
- Dot
- Clock
- Calendar
- Bell
- Shield/privacy
- Eye/eye-off
- Lock
- Circle/progress

---

## 3. Layout Tokens

Base screen: iPhone 390pt width.

### Screen

- Horizontal padding: 24pt
- Top safe area padding: system + 24pt
- Bottom safe area padding: system + 20pt
- Page title top margin: 32pt from top safe area or below navigation
- Main content top gap: 32pt

### Typography

- Screen title: 34–40pt, bold, near-black
- Step title: 28–32pt, bold, near-black
- Section label: 15–17pt, semibold, gray
- Body text: 17–20pt, regular, gray/black
- Input text: 20–24pt, regular
- Button text: 20–22pt, bold
- Helper text: 15–17pt, regular, gray

### Cards

- Large card radius: 24–28pt
- Input radius: 18–22pt
- Chip radius: 20–28pt
- Button radius: 18–22pt
- Card padding: 24pt
- Section gap: 24–32pt
- Input height: 64–76pt
- Chip height: 52–60pt
- Bottom CTA height: 64–72pt

### Progress Indicator

- Use small orange segments at top center.
- Segment width: 14–18pt
- Segment height: 3–4pt
- Segment radius: 2pt
- Active: orange
- Inactive: light gray
- Gap between segments: 7–9pt

---

## 4. Information Architecture

### Bottom Tabs

Keep four tabs:

1. Home
2. Register
3. History
4. Settings

### Home Tab

Home should show active reminders and today’s check state.

Home should not expose real medication names if privacy mode is enabled.

### Register Tab

Register tab should launch the new short multi-step flow.

It should not be a long scroll page.

### History Tab

History should show completed/missed check records.

### Settings Tab

Settings should only contain global app-level controls:

- Sensitive info default
- Default external app name
- Default private notification title/body
- Default reminder strength
- Default lock screen display
- Default widget display
- App badge
- Completion notification
- Freeze status
- Language
- Dev Mode
- App version

Settings should not contain detailed per-medication registration fields.

---

## 5. New Medication Registration Flow

The registration flow should be shortened to four main steps.

Remove the “How often?” step from the default flow. Most medication routines are daily. Daily is the default.

Advanced frequency/date range should be hidden under an optional advanced section.

### Step List

1. Name
2. Time
3. Notification & Privacy
4. Review & Save

Optional advanced schedule can be opened from Step 2 or Review.

---

# Step 1 — Name

## Purpose

Ask the user what this check should be called.

This should be an alias-first screen, not a real medication-name-first screen.

## Korean Copy

Title:

```text
이름을 정해주세요
```

Subtitle:

```text
실제 이름 대신 나만 아는 별칭을 사용할 수 있어요.
```

Input placeholder:

```text
예: Daily 1, Focus, 저녁 루틴
```

CTA:

```text
다음
```

## English Copy

Title:

```text
Name this check
```

Subtitle:

```text
You can use a private alias instead of the real name.
```

Input placeholder:

```text
Example: Daily 1, Focus, Night Routine
```

CTA:

```text
Next
```

## UI

- Top back arrow.
- Top progress indicator: 1 of 4.
- One large rounded input.
- Optional small helper below input.
- Fixed bottom CTA.

## Validation

- Alias is required.
- Real medication name is optional and should not be shown by default.

## Data

```ts
displayAlias: string
realMedicationName?: string
```

---

# Step 2 — Time

## Purpose

Let the user choose the daily reminder time.

This must feel like an alarm app.

Do not use a simple text input or normal form list.

## Korean Copy

Title:

```text
몇 시에 알려드릴까요?
```

Subtitle:

```text
기본은 매일 반복이에요. 필요하면 시간을 여러 개 추가할 수 있어요.
```

CTA:

```text
다음
```

Advanced schedule link:

```text
요일이나 기간을 따로 설정할래요
```

## English Copy

Title:

```text
What time should we remind you?
```

Subtitle:

```text
The default is every day. You can add more times if needed.
```

CTA:

```text
Next
```

Advanced schedule link:

```text
Set specific days or a date range
```

## Time Picker Design

Use a two-column alarm-style picker:

- Left column: hour
- Right column: minute
- Center selected row is emphasized.
- Non-selected rows are gray and slightly smaller/lower opacity.
- Selected row is large, bold, near-black.
- A subtle rounded highlight band sits behind the selected row.

### Picker Dimensions

- Picker container height: 240–300pt
- Selected row height: 56–64pt
- Hour column width: 50%
- Minute column width: 50%
- Text size selected: 40–48pt bold
- Text size unselected: 28–34pt medium
- Center colon optional, but if used, keep it subtle.

### Example Visual

```text
       02        55
       03        00   <- selected
       04        05
```

For Korean display below picker:

```text
오후 3:00
```

For English display below picker:

```text
3:00 PM
```

## Multiple Times

Below the picker, show selected reminder times as chips/cards:

```text
오후 3:00    ×
오후 9:00    ×
+ 시간 추가
```

Rules:

- At least one time required.
- Default time can be current nearest hour or 9:00 PM depending app default.
- Times should be sorted ascending.
- If user taps “+ 시간 추가”, add current picker value.
- If only one time exists, deleting should be disabled or require adding another first.

## Advanced Schedule

Default schedule is daily. Do not ask “how often?” in the main flow.

Advanced schedule is optional and hidden behind the link.

Advanced options:

- Every day — default
- Specific weekdays
- Date range

This can open a bottom sheet, not a full page.

### Advanced Schedule Bottom Sheet

Title:

```text
반복 설정
```

Options:

```text
매일
특정 요일
기간 설정
```

If “특정 요일” selected:

- Show weekday chips: 월 화 수 목 금 토 일.

If “기간 설정” selected:

- Show start date and end date cards.

Keep this secondary. Do not make the main flow longer.

## Data

```ts
reminderTimes: string[] // HH:mm
scheduleType: 'daily' | 'weekdays' | 'dateRange'
selectedWeekdays?: number[]
startDate?: Date
endDate?: Date
```

---

# Step 3 — Notification & Privacy

## Purpose

This is the most important screen.

The user should configure:

1. What the lock screen notification looks like
2. How hidden it should be
3. Reminder strength
4. Widget display behavior

Do this on one focused screen because these decisions are connected.

Do not split privacy, notification wording, lock screen, widget, and reminder strength across multiple settings pages.

## Korean Copy

Title:

```text
알림은 어떻게 보일까요?
```

Subtitle:

```text
잠금화면과 위젯에 표시될 모습을 미리 확인하세요.
```

CTA:

```text
다음
```

## English Copy

Title:

```text
How should alerts appear?
```

Subtitle:

```text
Preview what others may see on your lock screen and widgets.
```

CTA:

```text
Next
```

---

## 3-1. Notification Preview

At the top, show an iOS-style notification preview card.

### Preview Card Layout

- Card background: light gray `#F3F4F6`
- Radius: 22–28pt
- Height: 100–120pt
- Padding: 18–20pt
- Left icon: neutral rounded square, no pill icon
- Title: bold
- Body: regular
- Top-right: `now`

Example:

```text
[icon]  Daily Check                         now
        체크할 시간이야
```

If the user changes the title/body/privacy level, this preview must update live.

---

## 3-2. Privacy Level

Show privacy selection immediately below notification preview.

Use segmented chips or large option cards.

Options:

### Private

Korean:

```text
숨김
```

Description:

```text
알림과 위젯에 약 정보가 보이지 않아요.
```

Notification:

```text
Daily Check
체크할 시간이야
```

Widget:

```text
Today 1개 대기
```

This should be the default.

### Alias Only

Korean:

```text
별칭만
```

Description:

```text
내가 정한 이름만 표시해요.
```

Notification example:

```text
Focus
체크할 시간이야
```

Widget example:

```text
Focus 대기
```

### Visible

Korean:

```text
표시
```

Description:

```text
상세 정보를 표시해요.
```

This should not be default.

### Custom

Korean:

```text
직접 설정
```

Description:

```text
알림 제목과 본문을 직접 정해요.
```

---

## 3-3. Notification Text Inputs

Show inputs on this screen, but only when useful.

Default Private mode:

- Show title/body fields as editable but collapsed or compact.
- Default title: `Daily Check`
- Default body: `체크할 시간이야`

Custom mode:

- Expand title/body fields.

Fields:

```text
알림 제목
Daily Check
```

```text
알림 본문
체크할 시간이야
```

Presets as chips:

```text
Daily Check
Routine
Focus
Today
Custom
```

Body presets:

```text
체크할 시간이야
확인이 필요해요
아직 완료되지 않았어요
오늘 체크
```

Forbidden by default:

- 약
- 복용
- 알약
- 처방
- 피임약
- ADHD
- 병원
- 약국
- 💊

If the user types sensitive terms, do not block them, but show a warning:

```text
이 문구는 잠금화면에 표시될 수 있어요.
```

---

## 3-4. Reminder Strength

Put reminder strength on the same screen, below privacy options.

Options:

### Light

Korean:

```text
Light
```

Description:

```text
정시 알림 + 10분 뒤 한 번
```

Schedule:

```text
0분 → 10분
```

### Standard

Korean:

```text
Standard
```

Description:

```text
몇 번 더 알려줘요
```

Schedule:

```text
-15분 → 정시 → 5분 → 15분 → 30분
```

Default.

### Strict

Korean:

```text
Strict
```

Description:

```text
확인할 때까지 더 오래 유지해요
```

Schedule:

```text
-15분 → 정시 → 5분 → 10분 → 20분 → 30분 → 60분+
```

Avoid guilt-based wording. Do not say “강제” in the UI.

---

## 3-5. Widget Display

Widget display should be configured here, not buried in Settings.

Options:

```text
표시
별칭만
시간만
숨김
```

Recommended default for sensitive item:

```text
별칭만
```

Private mode default:

```text
시간만 또는 별칭만
```

Preview examples:

### Widget Preview — Private

```text
Today
1개 대기
다음 오후 3:00
```

### Widget Preview — Alias Only

```text
Focus
대기
오후 3:00
```

### Widget Preview — Time Only

```text
Today
다음 오후 3:00
```

### Widget Preview — Hidden

```text
위젯에 표시하지 않음
```

---

## 3-6. Lock Screen Display

Lock screen display should also live here.

Options:

```text
중립 표시
별칭 표시
숨김
```

Recommended default:

```text
중립 표시
```

Preview:

```text
Daily Check
체크할 시간이야
```

---

## Screen Structure for Step 3

Order:

1. Notification preview card
2. Privacy level chips/cards
3. Notification title/body inputs or presets
4. Reminder strength chips/cards
5. Widget display chips + small widget preview
6. Lock screen display chips
7. Bottom CTA

This screen may scroll if necessary, but it should not feel like the current long Settings page.

Use grouped cards and keep each group compact.

---

# Step 4 — Review & Save

## Purpose

Show the final setup clearly before saving.

## Korean Copy

Title:

```text
확인해주세요
```

Subtitle:

```text
이대로 체크를 만들게요.
```

CTA:

```text
저장
```

## Review Card

Show:

```text
이름          Focus
시간          매일 오후 3:00
알림          Daily Check / 체크할 시간이야
숨김          중립 표시 · 별칭만
강도          Standard
위젯          별칭만
```

Do not over-explain.

Allow tapping each row to edit that step.

## After Save

- Save item.
- Schedule notifications.
- Update app badge.
- Update widgets.
- Return to Home.

---

## 6. Settings Tab Redesign

Settings must be shorter.

Do not put the entire per-medication notification/privacy editor in Settings.

Settings should contain only global defaults.

### Recommended Settings Sections

1. Privacy Defaults
2. Notification Defaults
3. Widget & Badge
4. Freeze
5. Language
6. Developer Options
7. App Version

---

# Settings Section 1 — Privacy Defaults

Card title:

```text
민감 정보 기본값
```

Main question:

```text
새 항목은 기본적으로 숨길까요?
```

Options:

```text
예, 숨겨줘요
아니요, 표시해도 돼요
```

Helper:

```text
새로 등록하는 항목에만 적용됩니다. 이미 등록한 항목은 각 항목에서 바꿀 수 있어요.
```

This replaces the long repeated privacy settings.

---

# Settings Section 2 — Notification Defaults

Card title:

```text
알림 기본값
```

Rows:

```text
외부 표시 이름        Daily Check
기본 제목             Daily Check
기본 본문             체크할 시간이야
기본 강도             Standard
잠금화면 표시          중립 표시
```

Each row opens a compact bottom sheet.

Do not show all text fields expanded by default.

---

# Settings Section 3 — Widget & Badge

Card title:

```text
위젯과 배지
```

Rows/toggles:

```text
앱 배지               On
완료 알림             Off
위젯 기본 표시         별칭만
```

Helper for app badge:

```text
오늘 미완료 체크 개수를 숫자로만 표시합니다.
```

---

# Settings Section 4 — Freeze

Keep current Freeze section but make it compact.

Card title:

```text
FREEZE 현황
```

Content:

```text
남은 Freeze: 0 / 3개
15일 연속 체크 시 Freeze 1개 획득
```

Use progress bars if useful.

---

# Settings Section 5 — Language

Keep existing language chips:

```text
한국어
English
日本語
```

---

# Settings Section 6 — Developer Options

Collapse by default.

Card title:

```text
개발 옵션
```

Show Dev Mode toggle only.

---

# Settings Footer

```text
Daily Check v1.0.0
```

Use the app's external/private name if privacy mode is enabled.

---

## 7. What Should Move Out of Settings

Move these out of Settings and into the registration/edit item flow:

- Per-item privacy level
- Per-item notification title
- Per-item notification body
- Per-item lock screen behavior
- Per-item widget behavior
- Per-item reminder strength
- Per-item alias

Settings should provide defaults only.

---

## 8. Home Screen Improvements

Current Home screen shows repeated entries like:

```text
오후 3:00 hi
오후 3:00 hi
오후 3:00 hi
```

This looks unfinished and exposes aliases in a raw way.

Improve the list row.

### Home Row Layout

```text
[status dot] 오후 3:00       Daily Check or alias      [인증] [ON] [×]
```

If privacy mode is private:

```text
[dot] 오후 3:00       체크 필요        [인증] [ON]
```

If alias only:

```text
[dot] 오후 3:00       Focus           [인증] [ON]
```

If visible:

```text
[dot] 오후 3:00       real name       [인증] [ON]
```

### Row Dimensions

- Row height: 72–84pt
- Card radius: 20–24pt
- Horizontal padding: 20–24pt
- Time font: 22–26pt bold
- Alias/status font: 18–22pt regular
- Action button height: 44–48pt
- Delete icon: gray and subtle

### Warning Banner

Current banner is useful but too text-heavy.

Suggested copy:

```text
알림이 꺼져 있어요
체크를 놓치지 않으려면 알림을 켜주세요.
[설정으로 이동]
```

Keep it short.

---

## 9. Notification Behavior

### Default Notification

Title:

```text
Daily Check
```

Body:

```text
체크할 시간이야
```

### Follow-up Notification

Title:

```text
Daily Check
```

Body:

```text
아직 완료되지 않았어요
```

### Delayed Notification

Title:

```text
Daily Check
```

Body:

```text
확인이 지연되고 있어요
```

### Notification Actions

Actions:

```text
체크하기
10분 뒤
나중에
```

Rules:

- Swiping away the notification does not count as completed.
- Tapping “체크하기” opens scan/verification flow.
- Tapping “10분 뒤” schedules a snooze.
- Tapping “나중에” keeps the item pending.
- Completion cancels remaining follow-up notifications.

---

## 10. Reminder Strength Logic

### Light

```text
0 min
10 min
```

### Standard

```text
-15 min
0 min
5 min
15 min
30 min
```

### Strict

```text
-15 min
0 min
5 min
10 min
20 min
30 min
45 min
60 min
90 min
120 min
180 min
```

Rules:

- Do not schedule unlimited notifications.
- Strict mode should stop after a reasonable maximum, such as 3 hours.
- Completion cancels all pending reminders for that check.
- Skipped status also cancels remaining reminders for that check.

---

## 11. Data Model

Use a model similar to:

```ts
type PrivacyLevel = 'private' | 'aliasOnly' | 'visible' | 'custom';
type ReminderStrength = 'light' | 'standard' | 'strict';
type WidgetDisplay = 'visible' | 'aliasOnly' | 'timeOnly' | 'hidden';
type LockScreenDisplay = 'neutral' | 'aliasOnly' | 'hidden';
type ScheduleType = 'daily' | 'weekdays' | 'dateRange';

interface CheckItem {
  id: string;
  displayAlias: string;
  realMedicationName?: string;

  scheduleType: ScheduleType;
  reminderTimes: string[]; // HH:mm
  selectedWeekdays?: number[];
  startDate?: string;
  endDate?: string;

  privacyLevel: PrivacyLevel;
  notificationTitle: string;
  notificationBody: string;
  lockScreenDisplay: LockScreenDisplay;
  widgetDisplay: WidgetDisplay;
  reminderStrength: ReminderStrength;

  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 12. Implementation Tasks

### Registration Flow

- Replace long medication registration form with 4-step wizard.
- Remove default frequency step.
- Add alarm-style time picker.
- Add advanced schedule as optional bottom sheet.
- Add notification preview and privacy controls in one screen.
- Add review screen.

### Settings

- Shorten Settings tab.
- Convert per-item settings to global defaults only.
- Use rows and bottom sheets instead of long expanded fields.
- Keep Freeze, Language, Dev Mode, Version.

### Home

- Clean up reminder row layout.
- Respect privacy display mode.
- Make notification permission banner shorter.

### Notifications

- Use neutral default notification text.
- Implement reminder strength schedules.
- Make notification preview match actual scheduled notifications.
- Ensure completion cancels scheduled follow-ups.

### Widgets

- Respect widget display setting.
- Never show real medication names in private mode.
- Use neutral wording: Today, Routine, pending, next time, completed.

---

## 13. Acceptance Criteria

### Registration

- User can create a daily check in 4 steps or fewer.
- User does not need to answer frequency unless they open advanced schedule.
- Time selection looks like an alarm picker with hour and minute columns.
- User sees notification preview before saving.
- User can choose privacy, reminder strength, widget display, and lock screen display on one screen.

### Settings

- Settings is no longer a huge scroll page.
- Settings only controls global defaults.
- Per-item notification/privacy settings are not duplicated in Settings.

### Privacy

- Private mode does not show medication words on lock screen.
- Private mode does not show real medication names in widgets.
- Notification payload uses neutral title/body.
- App badge shows only count.

### UI Quality

- Matches current soft card-based design.
- Uses orange for primary action and progress.
- Uses near-black navy for selected chips.
- No medical icons or pill visuals.
- Bottom CTA is fixed and easy to reach.

---

## 14. Final Product Principle

Timepill should behave like a medication adherence app, but externally look like a private routine check app.

The user should know exactly what the alert means. Other people should not.
