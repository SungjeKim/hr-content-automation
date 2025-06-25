# 📋 HR 콘텐츠 자동화 시스템 스크립트 가이드

## 🚀 시스템 설정 및 시작

```bash
# 전체 시스템 설치 및 설정 확인
npm install
npm run setup
npm run verify

# 개발 서버 시작
npm run dev

# 프로덕션 서버 시작
npm start
```

## 🧪 테스트 실행

```bash
# 전체 통합 테스트
npm test

# 개별 테스트 실행
npm run test:workflow     # 워크플로우 테스트
npm run test:api         # API 테스트
npm run test:data        # 데이터 무결성 테스트
npm run test:performance # 성능 테스트
npm run test:user        # 사용자 플로우 테스트
```

## 🔧 각 모듈별 개별 실행

```bash
# 브런치 분석
npm run analyze

# HR 기사 수집
npm run collect

# 기사 필터링
npm run filter

# 글 생성
npm run generate

# 품질 검증
npm run quality

# 기존 워크플로우 (글 생성까지)
npm run workflow

# 전체 발행 워크플로우 (발행까지)
npm run publish-workflow
```

## 🏃‍♂️ 시스템 관리

```bash
# 스케줄러 시작
npm run scheduler

# Job Manager 시작  
npm run jobs

# 시스템 상태 확인
npm run health

# 메트릭 확인
npm run metrics

# 로그 확인
npm run logs
```

## 🌐 웹 인터페이스

시스템이 실행되면 다음 주소에서 웹 인터페이스에 접근할 수 있습니다:

- **메인 대시보드**: http://localhost:3001/
- **기사 관리**: http://localhost:3001/articles
- **초안 관리**: http://localhost:3001/drafts
- **워크플로우 관리**: http://localhost:3001/workflows
- **통계**: http://localhost:3001/analytics

## ⚙️ 환경 설정

시스템 실행 전 `.env` 파일에서 다음 항목들을 설정해주세요:

```bash
# 필수 설정
ANTHROPIC_API_KEY=your_claude_api_key_here
SESSION_SECRET=your_32_character_random_secret

# 브런치 자동 발행 (선택사항)
BRUNCH_EMAIL=your_brunch_email@example.com
BRUNCH_PASSWORD=your_brunch_password
```

## 📝 주요 워크플로우

### 1. 기본 콘텐츠 생성 워크플로우
```bash
npm run collect   # 1. HR 기사 수집
npm run filter    # 2. 품질 기사 선별
npm run generate  # 3. 브런치 스타일 글 생성
npm run quality   # 4. 품질 검증
```

### 2. 전체 자동화 워크플로우 (권장)
```bash
npm run publish-workflow  # 전체 과정 자동화 (생성→검토→발행)
```

### 3. 웹 대시보드 이용
1. `npm run dev` 또는 `npm start`로 서버 시작
2. http://localhost:3001/ 접속
3. "전체 워크플로우 시작" 버튼 클릭
4. 실시간으로 진행상황 모니터링
5. 필요시 사용자 검토 및 수정 요청

## 🔧 문제 해결

### 환경 설정 문제
```bash
npm run setup    # 초기 설정 재실행
npm run verify   # 시스템 검증
```

### 의존성 문제
```bash
rm -rf node_modules package-lock.json
npm install
```

### API 연결 문제
- `.env` 파일에서 `ANTHROPIC_API_KEY` 확인
- Claude API 크레딧 잔량 확인
- 네트워크 연결 상태 확인

### 브런치 발행 문제
- `.env` 파일에서 `BRUNCH_EMAIL`, `BRUNCH_PASSWORD` 확인
- 2단계 인증 설정 확인
- 브런치 로그인 상태 확인

## 📊 모니터링

### 시스템 상태 확인
```bash
npm run health   # 시스템 헬스체크
npm run metrics  # 성능 지표 확인
npm run logs     # 실시간 로그 확인
```

### 로그 파일 위치
- `logs/combined.log` - 전체 로그
- `logs/error.log` - 오류 로그
- `data/workflows/` - 워크플로우 실행 기록

## 🚀 프로덕션 배포

### 프로덕션 환경 설정
```bash
# .env 파일 설정
NODE_ENV=production
PORT=3001
HTTPS=true
CORS_ORIGIN=https://yourdomain.com

# 로그 레벨 설정
LOG_LEVEL=warn
LOG_TO_FILE=true

# 보안 설정
RATE_LIMIT_MAX=50
API_RATE_LIMIT_MAX=10
```

### 서버 시작
```bash
npm start  # PM2 또는 Docker 사용 권장
```

## ⚡ 성능 최적화

### 대용량 처리
- `MAX_ARTICLES_PER_DAY` 환경변수로 일일 생성량 조절
- `JOB_MAX_CONCURRENT` 환경변수로 동시 실행 Job 수 조절

### 메모리 관리
- 정기적인 데이터 정리: `DATA_RETENTION_DAYS` 설정
- 백업 활성화: `BACKUP_ENABLED=true`

## 🆘 지원

시스템 사용 중 문제가 발생하면:

1. `npm run verify`로 시스템 상태 확인
2. `logs/` 디렉토리의 로그 파일 확인
3. `verification-report.json` 검증 리포트 확인
4. GitHub Issues에 문제 상황 및 로그와 함께 제보

---

더 자세한 기술 문서는 각 모듈의 소스 코드 주석을 참고해주세요.