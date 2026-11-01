# Google 연결용 Cloudflare Worker

GitHub Pages는 그대로 사용합니다. Worker는 Google OAuth 인증과 접근 토큰 갱신만 담당합니다. 대화 내용은 브라우저에서 Drive로 직접 전송하며, OpenRouter API 키는 전송하지 않습니다.

## 배포

저장소 루트에서 실행합니다. Wrangler 명령은 Cloudflare 계정 로그인이 필요합니다.

```sh
npx wrangler login
npx wrangler kv namespace create SESSIONS --config worker/wrangler.jsonc
```

출력된 namespace ID를 `worker/wrangler.jsonc`의 `kv_namespaces[0].id`에 넣습니다. 다음 값도 수정합니다.

- `GOOGLE_CLIENT_ID`: Google Cloud의 웹 애플리케이션 OAuth 클라이언트 ID
- `REDIRECT_URI`: 실제 Worker 주소 + `/auth/callback`
- `APP_ORIGINS`: 허용할 앱 원본을 쉼표로 구분. 경로나 끝 슬래시 없이 입력합니다. 운영에서 localhost가 필요 없다면 제거하세요.

Worker 주소는 Cloudflare 대시보드의 계정 Workers 하위 도메인을 사용합니다. Google Cloud Console에서 Drive API를 켜고 OAuth 동의 화면에 `https://www.googleapis.com/auth/drive.appdata` 범위를 추가합니다. 같은 OAuth 클라이언트의 **승인된 리디렉션 URI**에 `REDIRECT_URI`를 정확히 등록합니다. 기존 JavaScript 원본 등록만으로는 충분하지 않습니다.

비밀 값은 Worker secret으로 등록합니다. 프런트엔드 `.env`에는 넣지 마세요.

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET --config worker/wrangler.jsonc
openssl rand -base64 32
npx wrangler secret put SESSION_ENCRYPTION_KEY --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

`openssl` 출력값을 `SESSION_ENCRYPTION_KEY` 입력 프롬프트에 붙여 넣습니다. 32바이트 AES 키이며 바꾸면 기존 연결은 다시 로그인해야 합니다. 첫 배포에 필요한 경우 먼저 `wrangler deploy`로 Worker를 생성한 뒤 secrets를 등록하고 다시 배포하세요.

GitHub 저장소 **Settings → Secrets and variables → Actions → Variables**에 다음 변수를 추가하고 Pages를 다시 빌드합니다.

```text
NUXT_PUBLIC_GOOGLE_SYNC_URL=https://aiscord-sync.YOUR_SUBDOMAIN.workers.dev
```

로컬 `.env`에도 같은 값을 넣습니다. Worker URL이 설정되면 기존 브라우저 전용 연결보다 우선합니다. 없으면 기존 방식으로 동작합니다. 앱 설정의 `구글로 로그인하고 동기화`로 최초 승인합니다.

## 동작과 확인

- OAuth state와 PKCE로 인증 요청을 연결합니다. state는 10분 후 만료됩니다.
- 갱신 토큰은 AES-GCM으로 암호화해서 KV에 보관합니다. 브라우저에는 세션 자격 증명이 저장됩니다. 이 값 역시 비밀이므로 공유하지 마세요.
- 세션은 마지막 사용으로부터 180일 후 만료됩니다. 앱을 열면 원격 데이터를 병합하고, 답변 완료 직후 및 일반 편집 후 2초 뒤 자동 저장합니다. 여러 답변이 동시에 생성 중이면 모두 끝난 뒤 저장합니다.
- 앱의 연결 해제는 Google 권한 철회와 Worker 세션 삭제를 수행합니다. 동일 Google 앱 권한을 사용하는 다른 기기도 재연결이 필요할 수 있습니다.
- Google 동의 화면이 외부 앱의 **Testing** 상태면 갱신 토큰이 7일 후 만료될 수 있습니다. 장기 사용 시 게시 상태와 Google의 검증 요구사항을 확인하세요.
- 인터넷 오류 때는 로컬 데이터와 미동기화 표시를 유지합니다. 앱을 다시 열거나 동기화 버튼을 눌러 재시도할 수 있습니다.

배포 후 최초 연결 → 답변 생성 → Drive 동기화 시간 변경 → 새로고침 복원 → 1시간 이상 지난 뒤 자동 갱신 → 연결 해제를 확인하세요. 실제 Google/Cloudflare 계정 검증은 로컬 단위 테스트로 대체되지 않습니다.

문서: [Google 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
