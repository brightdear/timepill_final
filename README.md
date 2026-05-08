# Timepill

복용 알림과 복용 인증을 위한 Expo/React Native 앱입니다.

이 브랜치에는 실시간 알약 스캔 기능이 포함되어 있습니다. `react-native-vision-camera`, `react-native-fast-tflite` 같은 native module을 사용하므로 Expo Go에서는 실행할 수 없습니다. 반드시 development build로 실행해야 합니다.

## 실행 환경

- Node.js
- npm
- Android Studio 또는 Android SDK
- USB 디버깅이 켜진 Android 기기

Android SDK의 `adb` 경로 예시:

```powershell
C:\Android\Sdk\platform-tools\adb.exe
```

## 처음 실행하기

### 1. 의존성 설치

```powershell
npm install --legacy-peer-deps
```

### 2. Android 기기 연결 확인

폰을 USB로 연결하고 USB 디버깅 허용 팝업을 승인한 뒤 확인합니다.

```powershell
& "C:\Android\Sdk\platform-tools\adb.exe" devices
```

정상이라면 아래처럼 `device`가 보여야 합니다.

```text
List of devices attached
XXXXXXXX	device
```

### 3. 앱 설치 및 실행

처음 실행하거나 native dependency가 바뀐 경우에는 development build를 다시 설치해야 합니다.

```powershell
npm run android
```

이 명령은 Android 앱을 빌드하고 연결된 기기에 설치한 뒤 Metro 서버에 연결합니다.

## 이미 앱이 설치되어 있을 때

앱이 이미 설치되어 있고 JS 코드만 바뀐 경우에는 Metro만 다시 실행해도 됩니다.

```powershell
npx expo start -c --dev-client
```

폰을 뺐다 다시 꽂으면 Metro 연결이 끊길 수 있습니다. 그럴 때는 아래 명령을 다시 실행합니다.

```powershell
& "C:\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
```

그 다음 앱을 다시 열거나 Metro 터미널에서 `r`을 눌러 reload합니다.

## 스캔 테스트

홈 화면의 `스캔 테스트` 버튼을 누르면 DB 인증 없이 실시간 카메라 스캔 화면으로 바로 들어갑니다.

테스트 모드 흐름:

1. 홈 화면에서 `스캔 테스트` 선택
2. `/scan?test=1`로 이동
3. 실시간 카메라 화면 표시
4. 알약 감지 시 `스캔 테스트 완료` 알림 표시

실제 복용 인증 흐름:

1. 복용 가능한 시간대의 약 카드에서 인증 진입
2. `/scan?slotId=...`로 이동
3. 실시간 스캔으로 알약 감지
4. 감지 성공 시 복용 기록을 `scan` 방식으로 완료 처리

## 자주 생기는 문제

### Expo Go에서 실행하면 native module 오류가 납니다

정상입니다. 이 앱의 실시간 스캔 기능은 native module을 사용하므로 Expo Go에서는 실행할 수 없습니다.

해결:

```powershell
npm run android
```

### 폰을 다시 연결한 뒤 앱이 Metro에 붙지 않습니다

USB 재연결 시 `adb reverse`가 풀릴 수 있습니다.

```powershell
& "C:\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
```

### 이전 코드나 예전 import 에러가 계속 보입니다

Metro 캐시를 비우고 다시 실행합니다.

```powershell
npx expo start -c --dev-client
```

### DB 관련 오류가 보입니다

기존 폰에 오래된 SQLite DB가 남아 있으면 schema mismatch가 날 수 있습니다. 현재 migration 단계에서 오래된 DB에 필요한 기본 테이블과 컬럼을 보강하도록 처리되어 있습니다.

그래도 같은 오류가 반복되면 앱을 완전히 종료한 뒤 다시 열고, 필요하면 Metro를 캐시 삭제로 재시작합니다.

```powershell
npx expo start -c --dev-client
```

## 주요 스캔 관련 파일

```text
app/scan.tsx
src/components/scan/RealtimePillScanner.tsx
src/domain/scan/
assets/models/best_int8.tflite
```

- `app/scan.tsx`: 스캔 라우트, 테스트 모드, 복용 인증 완료 처리
- `src/components/scan/RealtimePillScanner.tsx`: 실시간 카메라 UI와 frame processor
- `src/domain/scan/`: TFLite, YOLO, embedding, 기존 inference 로직
- `assets/models/best_int8.tflite`: 실시간 감지 모델

## 유용한 명령어

타입체크:

```powershell
npm run typecheck
```

Android 실행:

```powershell
npm run android
```

Metro 실행:

```powershell
npx expo start -c --dev-client
```

