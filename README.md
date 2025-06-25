# 🤖 HR 콘텐츠 자동화 시스템

브런치(Brunch) 플랫폼을 위한 HR 콘텐츠 자동 생성 및 발행 시스템입니다. Claude AI를 활용하여 HR 기사를 수집하고, 브런치 스타일로 글을 자동 생성하며, 품질 검증까지 수행하는 완전 자동화된 시스템입니다.

## 📋 주요 기능

### 🎯 핵심 기능
- **🔍 HR 기사 자동 수집**: Google News, 네이버 뉴스, HRD Korea 등에서 최신 HR 트렌드 수집
- **📊 브런치 스타일 분석**: 인기 브런치 포스트의 구조와 문체 패턴 학습
- **✍️ 자동 글 생성**: Claude AI를 활용한 브런치 스타일 콘텐츠 자동 작성
- **🎖️ 품질 자동 검증**: 4가지 기준(브런치 스타일, 콘텐츠 품질, 가독성, SEO)으로 자동 평가
- **⏰ 스케줄링**: 매일 자동으로 수집→분석→생성→검증 워크플로우 실행

### 🖥️ 관리 도구
- **📱 실시간 대시보드**: 웹 기반 관리 인터페이스
- **🔧 Job Manager**: 개별 작업 상태 추적 및 관리
- **📈 모니터링**: 시스템 상태, 성능 메트릭, 헬스체크
- **🧪 통합 테스트**: 전체 시스템 검증 도구

## 🚀 빠른 시작

### 1. 설치

```bash
# 저장소 클론
git clone <repository-url>
cd hr-content-automation

# 의존성 설치
npm install
```

### 2. 환경 설정

```bash
# 환경 변수 파일 복사
cp .env.example .env

# .env 파일 편집 (필수)
nano .env
```

**필수 설정 항목:**
```bash
# Claude API 키 (필수)
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-api-key-here

# 세션 보안 키 (32자 이상 랜덤 문자열)
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 3. 실행

```bash
# 개발 환경
npm run dev

# 프로덕션 환경
npm start

# 대시보드 접속
http://localhost:3001
```

## 🔧 명령어 가이드

### 🏃 실행 명령어
```bash
npm start          # 프로덕션 실행
npm run dev        # 개발 환경 실행 (nodemon)
npm test           # 통합 테스트 실행
```

### 🔍 개별 작업 실행
```bash
npm run analyze    # 브런치 스타일 분석만
npm run collect    # HR 기사 수집만
npm run generate   # 글 생성만 (기사 수집 후)
```

### 📊 모니터링
```bash
npm run health     # 시스템 상태 확인
npm run metrics    # 성능 메트릭 조회
npm run logs       # 실시간 로그 확인
```

### 🧪 테스트
```bash
npm test                # 전체 통합 테스트
npm run test:workflow   # 워크플로우 테스트만
npm run test:api        # API 연동 테스트만
npm run test:data       # 데이터 무결성 테스트만
npm run test:performance# 성능 테스트만
npm run test:user       # 사용자 시나리오 테스트만
```

## 📂 프로젝트 구조

```
hr-content-automation/
├── src/                          # 핵심 소스 코드
│   ├── analyzers/               # 분석 모듈
│   │   ├── contentFilter.js     # 콘텐츠 필터링
│   │   ├── qualityChecker.js    # 품질 검증
│   │   └── styleAnalyzer.js     # 스타일 분석
│   ├── jobs/                    # Job 관리
│   │   └── jobManager.js        # Job Manager 시스템
│   ├── scrapers/                # 웹 스크래핑
│   │   └── hrContentScraper.js  # HR 콘텐츠 수집기
│   ├── workflows/               # 워크플로우
│   │   └── contentCreation.js   # 콘텐츠 생성 플로우
│   ├── writers/                 # 글 작성
│   │   └── articleWriter.js     # Claude AI 글 작성기
│   ├── app.js                   # 개발용 서버
│   ├── scheduler.js             # 스케줄러
│   └── brunchAnalyzer-simple.js # 브런치 분석기
├── public/                       # 웹 대시보드
│   ├── css/                     # 스타일시트
│   ├── js/                      # 클라이언트 JavaScript
│   └── index.html               # 관리자 대시보드
├── test/                        # 테스트 파일
│   ├── integration.test.js      # 통합 테스트
│   └── README.md               # 테스트 가이드
├── data/                        # 데이터 저장소
├── logs/                        # 로그 파일
├── production.js                # 프로덕션 서버
├── .env.example                 # 환경 변수 예시
└── README.md                    # 이 파일
```

## 🎛️ 환경 변수 설정

### 🔑 필수 설정

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 (필수) | `sk-ant-api03-xxx...` |
| `SESSION_SECRET` | 세션 보안 키 (32자 이상) | `abc123def456...` |

### 🌐 서버 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `PORT` | `3001` | 서버 포트 |
| `NODE_ENV` | `development` | 실행 환경 |
| `HTTPS` | `false` | HTTPS 사용 여부 |
| `CORS_ORIGIN` | (빈값) | CORS 허용 도메인 |

### 🔒 보안 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `RATE_LIMIT_MAX` | `100` | 15분당 최대 요청 수 |
| `API_RATE_LIMIT_MAX` | `20` | 1분당 최대 API 요청 수 |

### ⏰ 스케줄러 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `SCHEDULER_ENABLED` | `true` | 스케줄러 활성화 |
| `SCHEDULE_SCRAPE_ENABLED` | `true` | 기사 수집 스케줄 |
| `SCHEDULE_GENERATE_ENABLED` | `true` | 글 생성 스케줄 |

## 📅 자동화 스케줄

### 🕘 기본 스케줄 (프로덕션)
- **매일 09:00** - HR 기사 자동 수집
- **매일 09:30** - 수집된 기사 필터링 및 분석
- **매일 10:00** - 추천 기사로 글 자동 생성 (3개)
- **매주 일요일 자정** - 브런치 스타일 재분석
- **매월 1일** - 통계 리포트 생성

### 🧪 개발 환경 스케줄
- **10분마다** - 기사 수집
- **15분마다** - 기사 필터링
- **20분마다** - 글 생성

## 🖥️ 웹 대시보드

### 📱 주요 화면
1. **메인 대시보드** (`/`)
   - 시스템 상태 개요
   - 최근 활동 로그
   - 주요 메트릭

2. **기사 관리** (`/articles`)
   - 수집된 기사 목록
   - 필터링 상태
   - 관련도 점수

3. **글 관리** (`/drafts`)
   - 생성된 글 목록
   - 품질 점수
   - 승인/편집 기능

### 🔧 실시간 기능
- **Socket.IO 기반 실시간 업데이트**
- **진행 상황 표시**
- **알림 시스템**
- **다크/라이트 테마**

## 🔍 모니터링 & 헬스체크

### 📊 엔드포인트
- **헬스체크**: `GET /health`
- **메트릭**: `GET /metrics` (Prometheus 형식)
- **로봇 파일**: `GET /robots.txt`

### 📈 모니터링 메트릭
```bash
# 시스템 상태 확인
curl http://localhost:3001/health

# Prometheus 메트릭
curl http://localhost:3001/metrics
```

## 🧪 테스트

### 🎯 테스트 시나리오
1. **전체 워크플로우 테스트** - 브런치 분석부터 글 생성까지
2. **API 연동 테스트** - Claude API 및 내부 API 검증
3. **데이터 무결성 테스트** - 파일 I/O 및 데이터 구조 검증
4. **성능 테스트** - 메모리 사용량 및 처리 속도
5. **사용자 시나리오 테스트** - 실제 사용 환경 시뮬레이션

### 🚀 테스트 실행
```bash
# 전체 테스트 (5-10분 소요)
npm test

# 빠른 테스트 (API 키 없이)
unset ANTHROPIC_API_KEY
npm test

# 개별 시나리오
npm run test:workflow    # 워크플로우만
npm run test:api        # API만
npm run test:performance # 성능만
```

## 🚧 문제 해결

### ❓ 자주 묻는 질문

**Q: Claude API 크레딧 부족 오류가 발생합니다.**
```bash
# API 키 확인
echo $ANTHROPIC_API_KEY

# 크레딧 잔액 확인 (Anthropic 대시보드)
# API 키 갱신 후 서버 재시작
```

**Q: 서버 연결이 안 됩니다.**
```bash
# 포트 사용 확인
lsof -i :3001

# 방화벽 확인
sudo ufw status

# 로그 확인
npm run logs
```

**Q: 스케줄러가 작동하지 않습니다.**
```bash
# 환경 변수 확인
echo $SCHEDULER_ENABLED

# 스케줄러 상태 확인
curl http://localhost:3001/api/scheduler/status

# 수동 실행
npm run collect
```

### 🐛 디버깅

**로그 레벨 조정:**
```bash
# .env 파일에서
LOG_LEVEL=debug

# 또는 실행 시
LOG_LEVEL=debug npm start
```

**상세 디버그 정보:**
```bash
# 모든 디버그 정보
DEBUG=* npm run dev

# 특정 모듈만
DEBUG=job-manager npm start
```

## 🔒 보안 고려사항

### ⚠️ 프로덕션 배포 시 확인사항

1. **환경 변수 보안**
   ```bash
   # 강력한 세션 키 생성
   SESSION_SECRET=$(openssl rand -hex 32)
   
   # 프로덕션 설정
   NODE_ENV=production
   HTTPS=true
   ```

2. **CORS 설정**
   ```bash
   # 허용 도메인 제한
   CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com
   ```

3. **Rate Limiting**
   ```bash
   # 더 엄격한 제한
   RATE_LIMIT_MAX=50
   API_RATE_LIMIT_MAX=10
   ```

4. **로그 보안**
   ```bash
   # 프로덕션 로그 레벨
   LOG_LEVEL=warn
   
   # 로그 파일 권한 설정
   chmod 600 logs/*.log
   ```

### 🛡️ 보안 기능
- **Helmet.js**: HTTP 보안 헤더
- **Rate Limiting**: DDoS 방지
- **CORS 설정**: 크로스 오리진 제어
- **세션 보안**: HttpOnly, Secure 쿠키
- **입력 검증**: XSS, SQL 인젝션 방지

## 🤝 기여하기

### 🔄 개발 워크플로우
1. Fork 저장소
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

### 📝 코딩 스타일
- ES6+ 문법 사용
- 2스페이스 들여쓰기
- 함수/변수명은 camelCase
- 클래스명은 PascalCase
- 상수는 UPPER_SNAKE_CASE

### 🧪 테스트 작성
새로운 기능 추가 시 해당 테스트도 함께 작성해주세요:
```javascript
// test/integration.test.js에 추가
async function testNewFeature() {
    // 테스트 로직 작성
}
```

## 📄 라이선스

이 프로젝트는 ISC 라이선스하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 📞 지원 및 연락처

- **이슈 리포트**: [GitHub Issues](https://github.com/your-username/hr-content-automation/issues)
- **기능 요청**: [GitHub Discussions](https://github.com/your-username/hr-content-automation/discussions)
- **보안 문제**: security@yourdomain.com

---

**🚀 HR 콘텐츠 자동화로 더 효율적인 콘텐츠 생성을 경험해보세요!**