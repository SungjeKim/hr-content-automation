# 🧪 통합 테스트 가이드

## 📋 테스트 시나리오

### 1. 전체 워크플로우 테스트
**목적**: 브런치 분석부터 글 생성까지 전체 프로세스 검증
- ✅ 브런치 스타일 분석
- ✅ HR 기사 수집
- ✅ 콘텐츠 필터링 및 분석
- ✅ 글 자동 생성 (Claude API)
- ✅ 품질 검증

### 2. API 연동 테스트  
**목적**: 외부 API 및 내부 API 응답 검증
- ✅ 서버 상태 확인
- ✅ Job Manager API 테스트
- ✅ 스케줄러 API 테스트
- ✅ Claude API 응답 시간 측정

### 3. 데이터 무결성 테스트
**목적**: 데이터 저장/읽기 및 구조 검증
- ✅ 파일 I/O 정확성
- ✅ JSON 구조 검증
- ✅ 중복 데이터 처리

### 4. 성능 테스트
**목적**: 시스템 리소스 사용량 및 처리 속도 측정
- ✅ 메모리 사용량 모니터링
- ✅ 처리 속도 벤치마크
- ✅ 동시 작업 처리 능력

### 5. 사용자 시나리오 테스트
**목적**: 실제 사용 환경에서의 기능 검증
- ✅ 대시보드 접근
- ✅ 글 생성 워크플로우
- ✅ 에러 상황 처리

## 🚀 실행 방법

### 전체 테스트 실행
\`\`\`bash
npm test
\`\`\`

### 개별 시나리오 테스트
\`\`\`bash
# 워크플로우 테스트만
npm run test:workflow

# API 테스트만  
npm run test:api

# 데이터 무결성 테스트만
npm run test:data

# 성능 테스트만
npm run test:performance

# 사용자 시나리오 테스트만
npm run test:user
\`\`\`

## ⚙️ 테스트 설정

### 환경 변수
\`\`\`bash
# .env 파일에 설정
ANTHROPIC_API_KEY=your_api_key_here  # Claude API 테스트용
NODE_ENV=test                        # 테스트 환경 설정
\`\`\`

### 필수 조건
1. **서버 실행**: 테스트 전에 서버가 실행되어야 함
   \`\`\`bash
   npm start
   \`\`\`

2. **API 키 설정**: Claude API 테스트를 위해 API 키 필요

3. **포트 확인**: 기본 포트 3001이 사용 가능해야 함

## 📊 테스트 결과

### 콘솔 출력
- 실시간 진행 상황 표시
- 각 테스트 성공/실패 상태
- 성능 메트릭 (실행 시간, 메모리 사용량)
- 전체 요약 통계

### 리포트 파일
테스트 완료 후 자동 생성되는 리포트:

1. **JSON 리포트**: \`test/integration-test-report-[timestamp].json\`
   - 상세한 테스트 결과 데이터
   - 개발자용 분석 데이터

2. **HTML 리포트**: \`test/integration-test-report-[timestamp].html\`
   - 시각적 리포트
   - 브라우저에서 확인 가능

## 🔧 테스트 커스터마이징

### 타임아웃 설정
\`\`\`javascript
const TEST_CONFIG = {
    timeout: 300000, // 5분 (밀리초)
    // ...
};
\`\`\`

### API URL 변경
\`\`\`javascript
const TEST_CONFIG = {
    apiUrl: 'http://localhost:3001',
    // ...
};
\`\`\`

### Claude API 테스트 비활성화
\`\`\`bash
# API 키 없이 실행하면 자동으로 건너뜀
unset ANTHROPIC_API_KEY
npm test
\`\`\`

## 🐛 문제 해결

### 자주 발생하는 오류

1. **서버 연결 실패**
   - 서버가 실행 중인지 확인
   - 포트 3001이 사용 가능한지 확인

2. **Claude API 오류**
   - API 키가 올바른지 확인
   - 크레딧 잔액 확인

3. **메모리 부족**
   - Node.js 힙 메모리 증가
   \`\`\`bash
   node --max-old-space-size=4096 test/integration.test.js
   \`\`\`

4. **타임아웃 오류**
   - 네트워크 상태 확인
   - 타임아웃 값 증가

### 로그 확인
\`\`\`bash
# 상세 로그와 함께 실행
DEBUG=* npm test

# 특정 컴포넌트 로그만
DEBUG=job-manager npm test
\`\`\`

## 📈 성능 기준

### 예상 실행 시간
- **전체 테스트**: 3-5분
- **워크플로우 테스트**: 1-2분  
- **API 테스트**: 30초-1분
- **데이터 테스트**: 10-30초
- **성능 테스트**: 30초-1분
- **사용자 시나리오**: 30초-1분

### 성공 기준
- **전체 성공률**: 90% 이상
- **메모리 사용량**: 500MB 이하
- **API 응답 시간**: 5초 이하
- **데이터 무결성**: 100%

## 🤝 기여하기

새로운 테스트 시나리오 추가:

1. \`test/integration.test.js\`에 새 함수 추가
2. \`runIntegrationTests()\`에서 호출
3. 적절한 검증 로직 구현
4. 문서 업데이트