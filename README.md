<div align="center">

<img src="public/illustration.webp" alt="HYPER_SEND" width="260" />

# <img src="src/app/icon.svg" alt="" width="34" /> HYPER_SEND

**가볍게 올리고, 코드 하나로 받는 파일 공유 서비스**

한양대학교 구성원을 위한 · 브라우저 종단간 암호화 · 자동 만료

<a href="https://hyps.soumt.moe"><img src="https://img.shields.io/badge/live-hyps.soumt.moe-2549BB?style=flat-square" alt="live" /></a>
<img src="https://img.shields.io/badge/Next.js-16-111111?style=flat-square&logo=nextdotjs" alt="Next.js 16" />
<img src="https://img.shields.io/badge/PostgreSQL-15-111111?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
<a href="https://github.com/soumt-r/HYPER_SEND/pkgs/container/hyper_send"><img src="https://img.shields.io/badge/ghcr.io-hyper__send-111111?style=flat-square&logo=docker&logoColor=white" alt="Docker image" /></a>

</div>

---

## 이런 걸 합니다

| | |
|---|---|
| **번들 업로드** | 한 번에 최대 20개 · 파일당 최대 2GB, 묶음 하나에 8자리 코드 하나. 50MB 단위로 나눠 올려서 Cloudflare 요청 크기 제한에 걸리지 않아요 |
| **코드로 다운로드** | 링크 대신 `A1B2C3D4` 같은 코드만 알려주면 끝 |
| **종단간 암호화 (선택)** | 비밀번호를 걸면 브라우저에서 AES-256-GCM으로 암호화한 뒤 업로드 — 서버는 내용을 볼 수 없어요 (파일 이름·형식·크기는 암호화되지 않습니다) |
| **자동 만료** | 다운로드 1–100회 또는 1–168시간 기준으로 만료, 어떤 조건이든 최대 7일 뒤 삭제 |
| **학교 계정 로그인** | `@hanyang.ac.kr` 구글 계정으로 로그인, 사용자별 5GB 용량 |
| **다크 모드** | 라이트 / 다크 테마 지원 |

## 셀프 호스팅

GitHub Actions가 `master`에 푸시될 때마다 이미지를 빌드해 GHCR에 올립니다. 서버에서는 받아서 띄우기만 하면 돼요.

```bash
# docker-compose.yml, .env.example만 있으면 됩니다
cp .env.example .env
# .env 채우기 (POSTGRES_PASSWORD는 `openssl rand -hex 24` 추천)

docker compose pull
docker compose up -d
```

| 변수 | 설명 |
|---|---|
| `HYPER_SEND_IMAGE` | 실행할 이미지 (기본 `ghcr.io/soumt-r/hyper_send:latest`) |
| `POSTGRES_PASSWORD` | DB 비밀번호 — 영숫자만 |
| `AUTH_SECRET` | `npx auth secret`으로 생성 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 클라이언트 (리디렉션 URI: `https://<도메인>/api/auth/callback/google`) |
| `ADMIN_EMAIL` | 관리자 페이지에 접근할 이메일 |

DB 스키마는 컨테이너가 시작될 때 자동으로 생성·마이그레이션됩니다. 도메인이 다르다면 `docker-compose.yml`의 `NEXTAUTH_URL` / `AUTH_URL`도 바꿔주세요. 업로드된 파일은 `./uploads`에 저장됩니다.

앱 포트는 `127.0.0.1:3000`에만 열리며, Cloudflare Tunnel(`cloudflared`)이 호스트에서 `http://localhost:3000`으로 연결하는 구성을 전제로 합니다. 요청 제한은 `CF-Connecting-IP` 기준으로 동작하며, 잘못된 다운로드 코드를 10번 입력하면 15분간 조회가 막힙니다.

### 로그인 세션 보안

로그인은 암호화된 JWT 쿠키(7일, 사용 중이면 매일 연장)로 유지됩니다. `AUTH_SECRET`이 있으면 누구의 로그인 토큰이든 만들 수 있으므로 `npx auth secret`으로 만든 값을 `.env`에만 두세요.

- 로그아웃하면 그 계정의 모든 기기에서 로그아웃되고, 복사된 토큰도 무효가 됩니다.
- 특정 사용자를 강제로 로그아웃시키려면:
  ```bash
  docker compose exec -T db psql -U hyper_user hyper_send -c "update \"user\" set \"sessionsValidAfter\" = now() where email = '대상@hanyang.ac.kr'"
  ```
- `AUTH_SECRET`이 유출됐다면 새 값으로 바꾸고 `docker compose up -d`로 재시작하세요. 모든 사용자가 즉시 로그아웃됩니다.

### 백업

백업 대상은 DB와 `./uploads` 두 가지입니다.

```bash
# DB
docker compose exec -T db pg_dump -U hyper_user hyper_send | gzip > hyper_send_$(date +%F).sql.gz

# 업로드된 파일 (진행 중인 업로드의 임시 파일은 제외)
tar czf uploads_$(date +%F).tar.gz --exclude=uploads/.tmp uploads
```

복원할 때는 `gunzip -c hyper_send_날짜.sql.gz | docker compose exec -T db psql -U hyper_user hyper_send`로 DB를 되살리고 `uploads` 폴더를 제자리에 풀면 됩니다.

## 로컬 개발

```bash
npm install
# .env.local에 DATABASE_URL, AUTH_* 설정
npx drizzle-kit push   # 로컬 DB에 스키마 반영
npm run dev
```

스키마(`src/db/schema.ts`)를 바꿨다면 `npx drizzle-kit generate`로 `drizzle/`에 마이그레이션을 추가해 함께 커밋하세요. 배포 시 자동으로 적용됩니다.

**Stack** — Next.js 16 (App Router, standalone) · Auth.js · Drizzle ORM · PostgreSQL · Tailwind CSS 4 · Framer Motion

---

<div align="center">
<sub>
HYPER_SEND는 한양대학교의 브랜딩을 사용하고 한양대학교 ERICA 학생이 제작하였지만, 대학 본부의 공식적인 인가를 받은 서비스는 아니에요.<br/>
Made by <b>Soumt</b> · 한양대학교 ERICA 국제문화대학 일본학과
</sub>
</div>
