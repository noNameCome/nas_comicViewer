# 만화책뷰어 (nas_comicViewer)

시놀로지 등 NAS의 WebDAV 공유 폴더에 있는 만화(zip/jpg/png/webp)를 스마트폰에서 다운로드 없이 바로 스트리밍으로 보는 안드로이드 앱입니다. 각자 자기 NAS 계정을 등록해서 사용할 수 있습니다.

## 주요 기능

- WebDAV 계정 등록 (호스트/포트/시작경로/아이디/비밀번호), 여러 라이브러리 등록 가능
- zip 파일을 전체 다운로드하지 않고 필요한 이미지만 부분(Range) 요청으로 읽어서 빠른 목록/썸네일 표시
- 목재 책장 스타일 다크테마, 세로 열 개수 선택(2/4/6/8/10)
- 뷰어: 스와이프/탭존 페이지 이동, 핀치줌, 더블탭줌, 회전 잠금, 이어보기(마지막으로 본 페이지부터)
- 정렬(파일명/날짜/크기), 검색, 히스토리, 즐겨찾기 탭
- 썸네일 로컬 캐시

## 기술 스택

- [Capacitor](https://capacitorjs.com/) (HTML/CSS/바닐라 JS + Android WebView), 번들러 없음
- WebDAV 통신용 커스텀 네이티브 플러그인(`WebdavHttpPlugin.java`, OkHttp 기반) — PROPFIND, Range GET 등 표준 `CapacitorHttp`가 지원하지 않는 요청 처리
- [`@zip.js/zip.js`](https://github.com/gildas-lormeau/zip.js) 커스텀 Range 리더로 zip 중앙 디렉터리 + 필요한 이미지만 읽음
- IndexedDB(파일 메타데이터/읽은 페이지) + Capacitor Preferences(라이브러리 설정) + Filesystem(썸네일 캐시)

## 빌드 방법

### 준비물

- Node.js
- Android Studio (JDK, Android SDK 포함)
- Python 3 + Pillow (`pip install pillow`) — 아이콘 자동 생성용
- `android/keystore.properties` — 릴리즈 서명 정보 (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`), git에는 포함되어 있지 않음
- `icon/` 폴더에 앱 아이콘으로 쓸 정사각형에 가까운 이미지 파일 1개 (jpg/png)

### 자동 빌드

프로젝트 루트의 `build.bat`을 더블클릭하면 다음이 순서대로 실행됩니다.

1. `icon/` 폴더의 이미지를 안드로이드 아이콘 크기들로 자동 리사이즈
2. 기본 아이콘 버전 APK 빌드 → `manga_viewer_basic_icon.apk`
3. 커스텀 아이콘 버전 APK 빌드 → `manga_viewer_custom_icon.apk`

### 수동 빌드

```
npx cap sync android
cd android
gradlew.bat assembleRelease
```

결과물: `android/app/build/outputs/apk/release/app-release.apk`

## 참고

- 이 앱은 플레이스토어에 배포하지 않는 사이드로딩 전용이라, 설치 시 "안전하지 않음" 경고가 뜨는 것이 정상입니다.
- `android/app/manga-release-key.jks`(릴리즈 서명 keystore)는 최초 생성 이후 계속 재사용해야 하는 파일이라 분실하지 않도록 별도 백업이 필요합니다.
