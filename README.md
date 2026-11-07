<p align="center">
  <img src="assets/stages/halyard-day.webp" alt="황금빛 햇살이 비치는 할야드 마리나" width="100%">
</p>

<h1 align="center">INKWAVE</h1>

<p align="center">
  <b>되찾는 물결</b> — 색을 잃은 항구를 잉크로 되살리는 1인 스토리 액션 캠페인이 중심이며 항구 대전 모드를 함께 제공한다.<br>
  바닥을 칠하고, 잉크 속을 헤엄치며, 적의 공격을 읽고 되받아쳐 항구에 색을 되돌린다. 항구 대전에서는 기존 4대4 영역 쟁탈을 즐긴다.
</p>

<p align="center">
  <a href="https://inkwave-aah.pages.dev"><b>▶ 지금 플레이하기</b></a> ·
  <a href="#controls">조작법</a> ·
  <a href="#playing-online">온라인 플레이</a> ·
  <a href="#running-locally">로컬 실행</a> ·
  <a href="#android">Android 빌드</a> ·
  <a href="#how-it-works">동작 원리</a> ·
  <a href="#direction">개발 방향</a> ·
  <a href="CONTRIBUTING.md">기여 방법</a>
</p>

<p align="center">
  <img alt="three.js r186" src="https://img.shields.io/badge/three.js-r186-000000?logo=three.js&logoColor=white">
  <a href="LICENSE"><img alt="MIT 라이선스" src="https://img.shields.io/badge/%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-MIT-blue"></a>
</p>

---

<a id="features"></a>

## 게임 특징

- **4대4 게임 모드**를 제공한다. 영역 쟁탈전은 바닥을 가장 넓게 칠한 팀이 승리한다. 구역 점령전은 활성 구역을 점령해 100부터 시작하는 카운트다운을 줄이는 방식이며, 순환하는 보조 구역·페널티·연장전이 적용된다. 세 가지 난이도의 봇을 상대로 플레이할 수 있다.
- **친구와 온라인으로 플레이**할 수 있다. 비공개 방을 만들고 다섯 자리 코드를 공유하면 최대 여덟 명이 각자의 장비와 외형으로 로비에 모인다. 빈자리는 봇이 채우며, 경기 도중 누군가 접속을 끊으면 봇이 해당 캐릭터를 대신 조종한다.
- **오징어 형태**로 변신할 수 있다. 변신 키를 누르고 있으면 아군 잉크에 잠수해 빠르게 헤엄치고 잉크 탱크를 채우며, 잉크가 칠해진 벽을 오르거나 돌고래처럼 뛰어올라 물 위의 틈을 건넌다.
- **서로 다른 손맛을 지닌 무기 열두 종**을 제공한다. 스프리처, 트윈파이어 피스톨, 캐노피 브롤리(산탄총과 발사 가능한 방패), 포퍼 블래스터, 스콜 스피너, 글린트 차저, 타이드라인 보우(세 갈래 화살과 두 단계 충전), 스웰 롤러, 스위시 브러시, 브라인 커틀러스(충전 시 한 방에 쓰러뜨리는 검), 스펀지 미츠(잉크 주먹·충전 도약·벽에 매달리기), 빌지 버킷을 사용할 수 있다. 주 무기는 보조 무기 15종 및 스페셜 19종과 자유롭게 조합할 수 있다.
- **여덟 개 스테이지를 낮이나 해질녘에 플레이**할 수 있다. 타이드워터 광장, 켈프라인 터미널, 할야드 마리나, 솔트팬 분지, 크로스로드 시장, 록게이트 운하, 테라스 고지대와 온라인 전용 카고 터미널은 각각 하나의 장소처럼 구성되어 있으며 고유한 지형을 갖는다. 일부 스테이지는 구역 점령전에서 구조 일부가 달라진다.
- **액체처럼 움직이는 잉크**를 표현한다. 튄 잉크가 퍼지고 가라앉으며, 갓 칠한 잉크는 윤기를 띠다가 마른다. 벽을 따라 잉크가 흘러내리고 헤엄친 자리에는 잉크 표면에 물결이 남는다.
- **한눈에 읽히는 전술 지도**를 제공한다. <kbd>Tab</kbd>을 누르고 있으면 카메라가 위로 올라가 현재 스테이지를 틸트 시프트 디오라마처럼 보여 준다. 아군 위치가 표시되며, 클릭 한 번으로 슈퍼 점프를 할 수 있다.
- **라커에서 캐릭터 외형을 설정**할 수 있다. 촉수 스타일, 머리 장비, 얼굴, 의상을 선택한다.
- **모든 요소를 절차적으로 생성**한다. 캐릭터, 애니메이션, 무기, 텍스처, 소품, 효과음, 음악을 모두 코드로 만든다. 외부에서 가져온 리소스는 글꼴(영문 Titan One·Rubik, 한글 Jua·Gowun Dodum)뿐이며 모두 저장소에 들어 있어 오프라인에서도 쓴다.

<p align="center">
  <img src="assets/stages/tidewater-day.webp" width="49%" alt="타이드워터 광장">
  <img src="assets/stages/kelpline-dusk.webp" width="49%" alt="해질녘의 켈프라인 터미널">
</p>

<a id="controls"></a>

## 조작법

| 동작 | 키보드 / 마우스 | 게임패드 |
|---|---|---|
| 이동 | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | 왼쪽 스틱 |
| 조준 | 마우스 | 오른쪽 스틱 |
| 발사 | 왼쪽 클릭 | RT |
| 오징어 형태 | <kbd>Shift</kbd> | LT |
| 점프 / 회피 구르기 | <kbd>Space</kbd> | A |
| 보조 무기(폭탄) | 오른쪽 클릭 / <kbd>E</kbd> | RB |
| 스페셜 | <kbd>F</kbd> | Y |
| 지도 + 슈퍼 점프 | <kbd>Tab</kbd> 또는 <kbd>M</kbd>을 누른 상태에서 <kbd>1</kbd>–<kbd>4</kbd>를 누르거나 위치 표시를 클릭한다. | 보기(View) 버튼 |
| 일시 정지 | <kbd>Esc</kbd> | 시작(Start) 버튼 |

게임패드는 호스팅된 HTTPS 버전에서 사용할 수 있다. 일반 `http://` LAN 주소로 접속하면 브라우저가 게임패드 API를 차단한다.

<a id="playing-online"></a>

## 온라인 플레이

메인 메뉴에서 **온라인(Online)**을 선택한 뒤 **방 만들기(Create a room)**로 방을 만들고 친구에게 코드를 전달한다. 친구가 만든 방에 들어가려면 **방 참가(Join a room)**를 선택하고 코드를 입력한다. 방장은 스테이지, 시간대, 경기 시간, 빈자리를 봇으로 채울지를 설정한다. 다른 참가자는 팀, 무기, 외형을 고르고 준비를 완료한다. 참가자 구성, 감정 표현, 준비 상태는 방 안의 모든 사람에게 실시간으로 표시된다.

방은 작은 중계 서버에서 동작한다. [`server/`](server)에 구현된 Cloudflare Worker가 방마다 하나의 Durable Object를 사용한다. 중계 서버는 메시지만 전달한다. 각 플레이어는 자신의 캐릭터를 시뮬레이션해 상태를 전송하고, 다른 플레이어의 캐릭터는 같은 애니메이션 시스템을 사용해 약 0.1초 늦춘 시점에서 부드럽게 보간해 그린다. 동작 원리와 측정 도구는 [`docs/NET.md`](docs/NET.md)에 설명되어 있다.

서버는 향후 C#으로 다시 만들 예정이다. 현재는 재작성 예정만 기록하며 서버의 상세 설계와 구현 계획은 수립하지 않는다.

자신의 네트워크에서 온라인으로 플레이하려면 게임과 함께 중계 서버를 실행한다.

```bash
npm install      # 최초 한 번 설치한다. 중계 서버는 wrangler로 실행한다.
npm run relay    # 접속 주소는 ws://<이 컴퓨터의 IP 주소>:8787이다.
```

`localhost`나 LAN 주소로 연 페이지는 이 중계 서버를 자동으로 사용한다. 다른 중계 서버를 사용하려면 URL에 `?relay=wss://…`를 지정한다.

<a id="running-locally"></a>

## 로컬 실행

Node.js(검증한 버전은 24)와 Chrome(또는 Edge)이 필요하다. 게임 코드는 TypeScript이며 개발 서버가 esbuild로 조립해 띄운다.

```bash
npm install --ignore-scripts
npm run dev          # http://localhost:8490 — 저장하면 다시 조립하고, 새로고침으로 반영한다
```

데스크톱 앱은 **Tauri 2**로 실행·패키징한다. `npm start`는 웹 자산을 `.desktop-dist/`에 준비한 뒤 Tauri 시작 화면을 연다. 시작 화면은 게임을 불러오지 않고, `게임 시작`을 누르면 낮은 화질로 게임을 불러온다. Windows에는 Visual Studio IDE 전체가 아니라 C++ Build Tools(MSVC)·Windows SDK·WebView2와 Rust(MSVC 도구 체인)가 필요하다. 자세한 요구 사항은 [Tauri 공식 문서](https://tauri.app/start/prerequisites/)를 따른다. 이전 Electron 앱의 설정·프로필은 자동으로 옮겨지지 않으므로 설정 화면의 내보내기·가져오기를 쓴다.

아래 표는 현재 `package.json`의 명령과 개발용 검사 도구이다.

| 명령 | 현재 역할과 주의점 |
|---|---|
| `npm install --ignore-scripts` | 잠금 파일의 의존성을 설치한다(Tauri CLI 포함). |
| `npm start` | 웹 자산을 준비한 뒤 Tauri 데스크톱 앱을 연다(첫 실행은 Rust 컴파일로 몇 분 걸린다). |
| `npm run desktop:typecheck` | 데스크톱 호스트 연결(`desktop/`)과 준비 도구의 타입 검사이다. 앱을 기동하지 않는다. |
| `npm run desktop:prepare` | 타입 검사 후 `.desktop-dist/`에 웹 자산과 호스트 연결을 만든다. `npm start`·`npm run package`·Android 빌드가 먼저 부른다. |
| `npm run desktop:check` | 웹 자산 준비 후 산출물을 검수하고 Rust를 `cargo check`한다. 앱은 기동하지 않는다. |
| `npm run dev` | `.web-dev/`를 조립하고 포트 8490 웹 서버와 변경 감시를 시작한다. 반영은 새로고침이며 타입 오류가 나면 직전 출력이 남고 화면에 붉은 상자로 알린다. |
| `npm run serve` | `npm run dev`와 같은 경로를 감시 없이 한 번 조립해 띄운다. |
| `npm run typecheck` | 게임 클라이언트(`tsconfig.json`), 행동 검사(`tests/client`, `tsconfig.tests.json`), 웹 개발 도구(`tools/client/`)의 타입 검사이다. |
| `npm run test:client` | `tests/client/**/*.test.ts`를 esbuild로 묶어 `node --test`로 돌리는 행동 검사이다(입력 프레임·패드·가상 키·캠페인 규칙·보상·저장). 실제 패드·터치 기기와 사람 완주를 대신하지 않는다. |
| `npm run verify` | `typecheck` → `check` → `test:client` → `build`를 차례로 실행한다. 실패한 단계의 종료 코드를 그대로 돌려준다. |
| `npm run smoke`, `npm run smoke:dist` | 개발 서버(8490) 또는 `dist/`(별도 8493)를 headless Chrome으로 열어 자동 조종 경기와 콘솔 오류·404를 확인한다(Windows·macOS·Linux). |
| `npm run compile` | `.web-dev/`만 조립한다(서버 없음). Node 도구 `tools/light-shots.mjs`·`stage-shots.mjs`는 이 출력을 읽는다. |
| `npm run package` | Tauri 릴리스와 Windows NSIS 설치 파일을 만든다. 출력은 `src-tauri/target/release/bundle/nsis/`이다. 설치 파일은 아직 검증하지 않았다. |
| `npm run check` | Node로 돌리는 도구·빌드 스크립트의 JavaScript 구문 검사이다. 타입 검사는 `typecheck`가 맡는다. |
| `npm run check-maps` | 맵 데이터 정합성 검사이다. |
| `npm run build` | `npm run compile` 뒤 컴파일 출력과 웹 파일을 `dist/`에 수집한다. Tauri 앱은 만들지 않는다. |
| `npm run botlab`, `npm run net-test` | 게임을 기동하는 자동 검사이다. `botlab`은 개발 서버에 headless Chrome으로 붙어 봇 경기·페이지 시험을 돌린다([사용법](tools/botlab/README.md)). `net-test`는 로컬 중계(`npm run relay`)에 두 클라이언트를 붙여 방 만들기·참가·경기를 확인한다. |
| `npm run bake -- <배치>` | 개발 서버의 실제 게임에서 맵 배치의 AO 라이트맵(`assets/lightmaps/`)을 headless Chrome으로 굽는다(예: `npm run bake -- lockgate`, 구역전 변형은 `lockgate.zones`). |
| `npm run android:init`, `npm run android:build` | Tauri 2 Android 프로젝트를 만들고 디버그 APK(arm64)를 빌드한다. 아래 [Android 빌드](#android)를 따른다. |
| `node .tools/<검사>.js` | 개발 서버(`npm run dev`)에 headless Chrome으로 붙는 자동 검사이다. 먼저 `tsc -p tsconfig.client-tools.json`으로 `.tools/`를 만든다. `mission-check`(21개 임무 목표·체크포인트·저장·보상, `--mission 1-1,…`), `story-check`(이야기 메뉴·패널·대화·항구 지도·기록, `--only en`은 영어 화면 한글 잔존), `workshop-check`(제작·강화·해금·작업장 카메라·저장 실패 재시도), `regress-check`(대전·구역·보스·연습·온라인 mock·이전 설정 보존), `campaign-check`·`action-run-check`(캠페인 액션·연출), `resource-check`(반복 전환 자원 수), `perf-check`(프레임·GPU 시간 측정표, `--mission 1-2 --headed`는 창이 있는 Chrome에서 실제 1-2 전투), `input-check`(가짜 패드·가상 키·터치). 상태 처리·자동 실행 검증이며 실기기·사람 완주가 아니다. |
| `node tools/mobile-lab.mjs` | 휴대폰 크기 터치 에뮬레이션에서 가상 버튼 배치·실제 터치 반응을 확인한다. 표시되는 fps는 데스크톱 GPU 위 정보값이다. |

<a id="android"></a>

### Android 빌드

Tauri 2 모바일 셸로 같은 웹 자산을 담은 디버그 APK(arm64)를 만든다. 서명 키는 저장소에 두지 않으며 디버그 키로 서명된다. 웹 개발·검사에는 Android 도구가 필요 없다.

1. **도구 설치**(한 번): 아래를 한 폴더(예: `%LOCALAPPDATA%\inkwave-android`)에 설치한다. 관리자 권한은 필요 없다.
   - JDK 17(예: Microsoft OpenJDK 17) → `jdk\`
   - Android 명령줄 도구 → `sdk\cmdline-tools\latest\`
   - `sdkmanager`로 `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`, `ndk;27.2.12479018`을 설치하고 `sdkmanager --licenses`로 라이선스를 수락한다. Gradle이 빌드 중에 Android SDK Platform 36을 더 받는다.
   - Rust Android 타깃: `rustup target add aarch64-linux-android`(나머지 타깃은 `android:init`이 추가한다)
2. **환경 변수**: 빌드하는 셸에 지정한다(PowerShell 예).
   ```powershell
   $root = "$env:LOCALAPPDATA\inkwave-android"
   $env:JAVA_HOME = "$root\jdk"
   $env:ANDROID_HOME = "$root\sdk"
   $env:NDK_HOME = "$root\sdk\ndk\27.2.12479018"
   ```
3. **프로젝트 생성**(새로 받은 저장소에서 한 번): `npm run android:init`. 생성되는 `src-tauri/gen/android/`(Gradle·Kotlin)는 도구 생성물이라 Git에 올리지 않고 직접 고치지 않는다.
4. **빌드**: `npm run android:build`(= `tauri android build --debug --apk --target aarch64`). 웹 자산 준비 → Rust 라이브러리 → Gradle 순서로 돈다.
   - Windows에서 "Creation symbolic link is not allowed for this system"으로 멈추면 설정 › 개발자용 › **개발자 모드**를 켜고 다시 실행한다. 개발자 모드를 켤 수 없으면 만들어진 `src-tauri/target/aarch64-linux-android/debug/libinkwave_desktop_lib.so`를 `src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/`에 복사한 뒤 `src-tauri/gen/android`에서 `.\gradlew assembleArm64Debug -x rustBuildArm64Debug`로 APK를 조립한다.
5. **산출물과 설치**: `src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk`(패키지 `local.inkwave.game`, minSdk 24, arm64 기기 전용). USB 디버깅을 켠 기기를 연결하고 `adb install -r <APK 경로>`로 설치한다(`adb`는 `sdk\platform-tools\`에 있다).

디버그 APK는 최적화하지 않은 Rust 라이브러리 때문에 약 150 MB이다. 실기기 조작·저장·성능은 아직 검증하지 않았다(33번 M004). iOS 앱은 macOS·Xcode·서명 환경이 필요하다(M005).

### 언어와 저장 백업

- 언어: 첫 실행은 한국어이다. 시작 화면의 언어 선택이나 설정 › 조작 탭 맨 위의 `언어 / Language`에서 English로 바꾸면 저장되어 다음 실행에도 유지된다(34번 F06). 사용자 이름·방 코드는 번역하지 않는다.
- 캠페인 저장은 브라우저 IndexedDB(`inkwave-campaign`)에 있다. 작업장 › 캠페인 관리의 `저장 내보내기`로 JSON 파일을 받고, `저장 가져오기`로 다른 브라우저·기기에 옮긴다. 가져오기는 검사를 통과한 파일만 받으며 실패하면 지금 저장을 그대로 둔다. 설정·대전 프로필은 설정 화면의 내보내기·가져오기로 따로 옮긴다.

### 검증 상태

결과를 서로 다른 것으로 구분한다. 세부 근거는 33번 각 태스크 절과 [36번 남은 일감](docs_working/남은-일감-순서-36.md)에 있다.

| 구분 | 상태(2026-11-07) |
|---|---|
| 웹 코드 검사 | `npm run typecheck`·`npm run check`·`npm run test:client`(84개, 전체 21개 임무 계산 완주 포함) 통과 |
| 자동 실행 검사 | 21개 임무 `mission-check`, 이야기·작업장·기존 모드 회귀, 영어 화면, 반복 전환 자원, 모바일 터치 에뮬레이션 통과(headless, 이 PC) |
| 사람의 실제 완주·조작감 | 미검증 — [33번 14절](docs_working/클라이언트-캠페인-상세구현계획-33.md#14-사용자-최종-일괄-검증) U 항목 |
| 실물 패드·실기기 | 미검증 — 33번 14절 U 항목, Android 실기기 M004, iOS M005(macOS 필요) |
| 앱 빌드·실행 | Tauri 데스크톱 `npm start` 실제 실행(시작·저장·재실행 유지·전체 화면·오프라인) 자동 확인, Android 디버그 APK 생성 확인(M003). 데스크톱 설치 패키지(`npm run package`)는 미실행 |

직접 고른 음원을 쓰려면 [`songs/README.md`](songs/README.md)를 참고한다. 음원 목록이 없으면 절차 생성 음악을 쓴다.

<a id="how-it-works"></a>

## 동작 원리

- **텍스처 공간에 잉크를 칠한다.** 칠할 수 있는 각 표면은 하나의 4K 텍스처 아틀라스 안에 자기 영역을 갖는다. GPU가 이 영역에 잉크 자국을 그리는 동안 CPU의 저해상도 격자는 영역 점수와 게임 판정에 사용하는 조회 결과를 동기화한다. 레벨 셰이더는 잉크 고유의 높이, 광택, 젖은 정도를 반영해 표면 위에 잉크를 덧입힌다. [`src/world/paint.ts`](src/world/paint.ts)와 [`src/world/inkShading.ts`](src/world/inkShading.ts)를 참고한다.
- **스테이지를 데이터로 정의한다.** 지형 데이터는 경기장 절반을 구성하는 상자와 경사로 목록이다. 나머지 절반은 이를 180° 회전해 만들므로 두 팀은 항상 동일한 조건의 지형에서 플레이한다. 주변광 차폐는 `npm run bake`([`tools/client/bake-ao.ts`](tools/client/bake-ao.ts))로 미리 계산해 `assets/lightmaps/`에 둔다. [`src/world/maps.ts`](src/world/maps.ts)를 참고한다.
- **캐릭터를 전적으로 절차적으로 생성한다.** 지오메트리, 재질, 뼈대 60개로 구성된 리그, 이동·오징어 형태·무기 자세·부가 움직임을 포함한 모든 애니메이션을 코드로 정의한다. 스프링 기반 자세 시스템이 움직임을 구동한다. [`docs/RIG.md`](docs/RIG.md)를 참고한다.
- **시스템은 이벤트로 소통한다.** 무기, 캐릭터, 경기 시스템이 타입이 정의된 이벤트를 발생시키고 효과, HUD, 오디오 시스템이 이를 구독한다. 이벤트와 시스템 사이의 규약은 [`docs/EVENTS.md`](docs/EVENTS.md)와 [`docs/CONTRACTS.md`](docs/CONTRACTS.md)에 정리되어 있다.
- **프레임 단위로 재현 가능한 도구를 제공한다.** 게임은 정지 및 한 프레임씩 진행하는 디버그 인터페이스를 제공한다. 이를 통해 연속 장면 이미지, 조작감 측정, 봇 시뮬레이션을 프레임 단위로 재현할 수 있다. 관련 도구는 `tools/film.py`와 `tools/measure-handling.mjs`이다.

렌더링에는 three.js r186을 사용한다. 라이브러리는 저장소(`vendor/three/`)에 포함하고 임포트 맵으로 불러온다. 게임 코드는 TypeScript이며 esbuild로 변환·조립한다. GTAO(주변광 차폐), 블룸, 자체 색보정 패스를 적용한다.

<a id="direction"></a>

## 개발 방향과 기술 정책

- **목표**: 기존 게임 코드·절차적 캐릭터·무기·7개 배경을 재사용해 1인 스토리 액션 캠페인 **「되찾는 물결」**을 만든다. 기존 4대4 대전·연습·보스·온라인은 "항구 대전"으로 유지한다. 외형·캐릭터·액션·스토리 구조의 차별화 방향은 [35번 리디자인 계획](docs_working/스토리-액션-리디자인-구현계획-35.md)에 있다.
- **기술**: 공통 클라이언트는 TypeScript + three.js이다. 직접 작성하는 게임 코드는 TypeScript 또는 C#이며, Tauri 2 호스트(데스크톱·Android 모바일 셸, 2026-11-06 결정)에 필요한 Rust·Cargo만 허용한다. 새 JavaScript·Java·Kotlin·Swift 구현은 추가하지 않는다. 기존 JavaScript 게임 코드는 동작을 보존하며 TypeScript로 모두 이전했다. HTML·CSS·JSON은 화면·리소스·설정에 쓴다.
- **지원 대상과 입력**: 웹(개발·기본 테스트), Android, iOS이다. 게임패드가 없으면 PC 웹·모바일 웹·앱 모두 가상 키를 제공한다. Xbox 360은 버튼 배치와 조작 방식의 기준이며, 표준·비표준 패드 매핑, 연결·해제·재연결, 중립 확인, 포커스 이탈 시 입력 초기화는 [32번 구현 설계](docs_working/클라이언트-멀티플랫폼-구현설계-32.md)를 따른다. 입력 장치 정책과 화질·GPU·메모리·화면 방향 정책은 분리한다.
- **단계**: 1차 완성 기준은 캠페인 1장(1-1·1-2·1-3)의 웹 플레이·저장 검증이며, 현재 7장 21개 임무와 엔딩까지 구현했다. Android는 Tauri 2 셸로 디버그 APK까지 만들었고 실기기 검증이 남았다. iOS 앱은 macOS·Xcode·서명 환경을 확보한 뒤 진행한다.
- **데스크톱**: 기본 실행·패키징은 Tauri 2이다. 로딩·렉·게임패드·언어 문제의 근거와 수정 기록은 [34번 정적 검토](docs_working/데스크톱-성능-게임패드-언어-정적검토-34.md)에 있다.
- **서버**: 현재는 Cloudflare Worker 중계 서버이며 향후 C#으로 재작성할 예정이다. 재작성 설계는 아직 시작하지 않았다.

### 문서 안내

| 문서 | 내용 |
|---|---|
| [서버·클라이언트 기술과 구조 (1번)](docs_working/서버-클라이언트-기술과-구조-1.md) | 기존 구현의 사용 기술, 클라이언트 구조, 서버 구조도와 온라인 통신 흐름이다. |
| [PvE 캠페인 기획 — 되찾는 물결 (2번)](docs_working/PvP-GDD/싱글플레이-PvE-캠페인-기획-2.md) | 7장·21개 임무, 적·보스·성장·아이템·보상·저장 규칙과 상세 문서 목차이다. `PvP-GDD`는 디렉터리 이름일 뿐 내용은 싱글 플레이 PvE이다. |
| [일러스트 시각설계 (29번)](docs_working/PvP-GDD/campaign/일러스트-시각설계-29.md) | 기획용 러프 그림 29장의 표현 규칙과 범례이다. |
| [클라이언트 전환 계획 (31번)](docs_working/클라이언트-멀티플랫폼-전환계획-31.md) | 확정한 지원 범위·기술·모바일 전환 조건이다. |
| [클라이언트 구현 설계 (32번)](docs_working/클라이언트-멀티플랫폼-구현설계-32.md) | 입력 프레임·매핑·생명주기·플랫폼 경계와 검증 시나리오이다. |
| [클라이언트·캠페인 상세 구현 계획 (33번)](docs_working/클라이언트-캠페인-상세구현계획-33.md) | 구현 태스크 T001~T074·M001~M005의 선행 조건·완료 조건·검증이다. |
| [데스크톱 성능·게임패드·언어 정적 검토 (34번)](docs_working/데스크톱-성능-게임패드-언어-정적검토-34.md) | 데스크톱 문제의 코드 근거와 수정 계획, Tauri 전환 기록이다. |
| [스토리 중심 액션 리디자인 계획 (35번)](docs_working/스토리-액션-리디자인-구현계획-35.md) | 잉크 그림책 룩, 귀여운 비율·표정·마스코트, 퍼펙트 잠수·잉크 서지 같은 액션, 이야기 우선 메뉴 구조의 태스크 R001~R034이다. |
| [남은 일감 순서 (36번)](docs_working/남은-일감-순서-36.md) | 남은 구현 일감의 진행 순서와 사람이 직접 하는 확인 목록이다. |
| [docs/CONTRACTS.md](docs/CONTRACTS.md), [docs/EVENTS.md](docs/EVENTS.md), [docs/RIG.md](docs/RIG.md), [docs/NET.md](docs/NET.md) | 기존 모듈·이벤트·리그·네트워크 계약이다. |
| [AGENTS.md](AGENTS.md) | 이 저장소에서 작업할 때 지키는 핵심 규칙이다. |

<a id="browser-support"></a>

## 지원 브라우저

Chrome과 Edge를 주요 대상으로 하며 Firefox에서도 동작한다. Safari에서도 실행할 수 있지만 속도가 더 느리다. 높음(High) 화질에는 외장 GPU나 최신 내장 GPU를 권장한다. 설정 메뉴에서 중간(Medium) 및 낮음(Low) 화질을 선택할 수 있다.

<a id="contributing"></a>

## 기여 방법

이슈와 풀 리퀘스트를 환영한다. 프로젝트 구조와 먼저 실행해야 할 검사는 [기여 안내](CONTRIBUTING.md)를 참고한다.

<a id="license"></a>

## 라이선스

[MIT 라이선스](LICENSE) © 2026 Jayden Davis. INKWAVE는 독립 프로젝트이며 닌텐도와 제휴 관계가 없다. 스플래툰은 닌텐도의 상표이다.
