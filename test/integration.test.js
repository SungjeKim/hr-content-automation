const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');

// 컴포넌트 임포트
const BrunchAnalyzer = require('../src/brunchAnalyzer-simple');
const HRContentScraper = require('../src/scrapers/hrContentScraper');
const ContentFilter = require('../src/analyzers/contentFilter');
const ArticleWriter = require('../src/writers/articleWriter');
const QualityChecker = require('../src/analyzers/qualityChecker');
const { getJobManager, JobTypes } = require('../src/jobs/jobManager');

// 테스트 설정
const TEST_CONFIG = {
    apiUrl: 'http://localhost:3001',
    timeout: 300000, // 5분
    dataDir: path.join(__dirname, '../data'),
    testDataDir: path.join(__dirname, 'test-data'),
    enableAPITests: process.env.ANTHROPIC_API_KEY ? true : false
};

// 테스트 결과 저장
const testResults = {
    startTime: new Date(),
    endTime: null,
    scenarios: [],
    summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
    }
};

// 유틸리티 함수들
const log = {
    info: (msg) => console.log(chalk.blue('ℹ'), msg),
    success: (msg) => console.log(chalk.green('✓'), msg),
    error: (msg) => console.log(chalk.red('✗'), msg),
    warning: (msg) => console.log(chalk.yellow('⚠'), msg),
    section: (msg) => console.log(chalk.bold.cyan(`\n=== ${msg} ===\n`))
};

async function measureTime(fn, name) {
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        return {
            success: true,
            duration,
            result,
            name
        };
    } catch (error) {
        const duration = Date.now() - start;
        return {
            success: false,
            duration,
            error: error.message,
            name
        };
    }
}

async function checkMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: Math.round(used.rss / 1024 / 1024),
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024)
    };
}

// 테스트 시나리오들

// 1. 전체 워크플로우 테스트
async function testFullWorkflow() {
    log.section('1. 전체 워크플로우 테스트');
    
    const scenario = {
        name: 'Full Workflow',
        tests: [],
        startTime: new Date()
    };
    
    try {
        // 1-1. 브런치 분석
        log.info('브런치 스타일 분석 중...');
        const brunchTest = await measureTime(async () => {
            const analyzer = new BrunchAnalyzer();
            const result = await analyzer.analyzeBrunchPost('https://brunch.co.kr/@hr-insight/latest');
            
            // 결과 검증
            if (!result || !result.patterns) {
                throw new Error('브런치 분석 결과가 올바르지 않습니다.');
            }
            
            return result;
        }, 'Brunch Analysis');
        
        scenario.tests.push(brunchTest);
        
        if (brunchTest.success) {
            log.success(`브런치 분석 완료 (${brunchTest.duration}ms)`);
        } else {
            log.error(`브런치 분석 실패: ${brunchTest.error}`);
        }
        
        // 1-2. 기사 수집
        log.info('HR 기사 수집 중...');
        const scrapingTest = await measureTime(async () => {
            const scraper = new HRContentScraper();
            const articles = await scraper.run();
            
            if (!Array.isArray(articles) || articles.length === 0) {
                throw new Error('수집된 기사가 없습니다.');
            }
            
            return { count: articles.length, articles };
        }, 'Article Collection');
        
        scenario.tests.push(scrapingTest);
        
        if (scrapingTest.success) {
            log.success(`기사 수집 완료: ${scrapingTest.result.count}개 (${scrapingTest.duration}ms)`);
        } else {
            log.error(`기사 수집 실패: ${scrapingTest.error}`);
        }
        
        // 1-3. 콘텐츠 필터링
        log.info('콘텐츠 필터링 중...');
        const filteringTest = await measureTime(async () => {
            const filter = new ContentFilter();
            const filtered = await filter.run();
            
            if (!Array.isArray(filtered)) {
                throw new Error('필터링 결과가 올바르지 않습니다.');
            }
            
            return { count: filtered.length, articles: filtered };
        }, 'Content Filtering');
        
        scenario.tests.push(filteringTest);
        
        if (filteringTest.success) {
            log.success(`필터링 완료: ${filteringTest.result.count}개 선별 (${filteringTest.duration}ms)`);
        } else {
            log.error(`필터링 실패: ${filteringTest.error}`);
        }
        
        // 1-4. 글 생성 (API 키가 있는 경우만)
        if (TEST_CONFIG.enableAPITests && filteringTest.success && filteringTest.result.count > 0) {
            log.info('글 자동 생성 중...');
            const generationTest = await measureTime(async () => {
                const writer = new ArticleWriter();
                const testArticle = filteringTest.result.articles[0];
                const generated = await writer.generateArticle(testArticle);
                
                if (!generated || !generated.title || !generated.body) {
                    throw new Error('생성된 글이 올바르지 않습니다.');
                }
                
                return generated;
            }, 'Article Generation');
            
            scenario.tests.push(generationTest);
            
            if (generationTest.success) {
                log.success(`글 생성 완료 (${generationTest.duration}ms)`);
                
                // 1-5. 품질 검증
                log.info('품질 검증 중...');
                const qualityTest = await measureTime(async () => {
                    const checker = new QualityChecker();
                    const report = await checker.generateQualityReport(generationTest.result);
                    
                    if (!report || !report.scores) {
                        throw new Error('품질 검증 결과가 올바르지 않습니다.');
                    }
                    
                    return report;
                }, 'Quality Check');
                
                scenario.tests.push(qualityTest);
                
                if (qualityTest.success) {
                    log.success(`품질 검증 완료: ${qualityTest.result.scores.total}점 (${qualityTest.duration}ms)`);
                } else {
                    log.error(`품질 검증 실패: ${qualityTest.error}`);
                }
            } else {
                log.error(`글 생성 실패: ${generationTest.error}`);
            }
        } else if (!TEST_CONFIG.enableAPITests) {
            log.warning('Claude API 키가 설정되지 않아 글 생성 테스트를 건너뜁니다.');
            scenario.tests.push({
                name: 'Article Generation',
                success: true,
                skipped: true,
                duration: 0
            });
        }
        
    } catch (error) {
        log.error(`워크플로우 테스트 실패: ${error.message}`);
        scenario.error = error.message;
    }
    
    scenario.endTime = new Date();
    scenario.duration = scenario.endTime - scenario.startTime;
    testResults.scenarios.push(scenario);
    
    // 결과 요약
    const passed = scenario.tests.filter(t => t.success && !t.skipped).length;
    const failed = scenario.tests.filter(t => !t.success).length;
    const skipped = scenario.tests.filter(t => t.skipped).length;
    
    log.info(`워크플로우 테스트 완료: ${passed}/${scenario.tests.length} 성공, ${failed} 실패, ${skipped} 건너뜀`);
}

// 2. API 연동 테스트
async function testAPIIntegration() {
    log.section('2. API 연동 테스트');
    
    const scenario = {
        name: 'API Integration',
        tests: [],
        startTime: new Date()
    };
    
    try {
        // 2-1. 서버 상태 확인
        log.info('서버 상태 확인 중...');
        const serverTest = await measureTime(async () => {
            const response = await axios.get(`${TEST_CONFIG.apiUrl}/api/stats`);
            
            if (response.status !== 200) {
                throw new Error(`서버 응답 오류: ${response.status}`);
            }
            
            return response.data;
        }, 'Server Status');
        
        scenario.tests.push(serverTest);
        
        if (serverTest.success) {
            log.success('서버 연결 성공');
        } else {
            log.error(`서버 연결 실패: ${serverTest.error}`);
            // 서버가 없으면 API 테스트 중단
            scenario.endTime = new Date();
            scenario.duration = scenario.endTime - scenario.startTime;
            testResults.scenarios.push(scenario);
            return;
        }
        
        // 2-2. Job Manager API 테스트
        log.info('Job Manager API 테스트 중...');
        const jobApiTest = await measureTime(async () => {
            const response = await axios.get(`${TEST_CONFIG.apiUrl}/api/jobs/status`);
            
            if (!response.data || typeof response.data.isRunning === 'undefined') {
                throw new Error('Job Manager 상태 응답이 올바르지 않습니다.');
            }
            
            return response.data;
        }, 'Job Manager API');
        
        scenario.tests.push(jobApiTest);
        
        if (jobApiTest.success) {
            log.success(`Job Manager 상태: ${jobApiTest.result.isRunning ? '실행 중' : '중지됨'}`);
        } else {
            log.error(`Job Manager API 오류: ${jobApiTest.error}`);
        }
        
        // 2-3. 스케줄러 API 테스트
        log.info('스케줄러 API 테스트 중...');
        const schedulerApiTest = await measureTime(async () => {
            const response = await axios.get(`${TEST_CONFIG.apiUrl}/api/scheduler/status`);
            
            if (!response.data) {
                throw new Error('스케줄러 상태 응답이 올바르지 않습니다.');
            }
            
            return response.data;
        }, 'Scheduler API');
        
        scenario.tests.push(schedulerApiTest);
        
        if (schedulerApiTest.success) {
            log.success(`스케줄러 상태: ${schedulerApiTest.result.isRunning ? '실행 중' : '중지됨'}`);
        } else {
            log.error(`스케줄러 API 오류: ${schedulerApiTest.error}`);
        }
        
        // 2-4. Claude API 응답 시간 테스트 (API 키가 있는 경우만)
        if (TEST_CONFIG.enableAPITests) {
            log.info('Claude API 응답 시간 테스트 중...');
            const claudeTest = await measureTime(async () => {
                const Anthropic = require('@anthropic-ai/sdk');
                const anthropic = new Anthropic({
                    apiKey: process.env.ANTHROPIC_API_KEY
                });
                
                const response = await anthropic.messages.create({
                    model: "claude-3-haiku-20240307",
                    max_tokens: 100,
                    temperature: 0.7,
                    messages: [{
                        role: "user",
                        content: "테스트 메시지입니다. 간단히 응답해주세요."
                    }]
                });
                
                return {
                    responseTime: Date.now(),
                    contentLength: response.content[0].text.length
                };
            }, 'Claude API Response');
            
            scenario.tests.push(claudeTest);
            
            if (claudeTest.success) {
                log.success(`Claude API 응답 성공 (${claudeTest.duration}ms)`);
            } else {
                log.error(`Claude API 오류: ${claudeTest.error}`);
            }
        }
        
    } catch (error) {
        log.error(`API 테스트 실패: ${error.message}`);
        scenario.error = error.message;
    }
    
    scenario.endTime = new Date();
    scenario.duration = scenario.endTime - scenario.startTime;
    testResults.scenarios.push(scenario);
}

// 3. 데이터 무결성 테스트
async function testDataIntegrity() {
    log.section('3. 데이터 무결성 테스트');
    
    const scenario = {
        name: 'Data Integrity',
        tests: [],
        startTime: new Date()
    };
    
    try {
        // 3-1. 파일 저장/읽기 테스트
        log.info('파일 저장/읽기 테스트 중...');
        const fileTest = await measureTime(async () => {
            const testData = {
                timestamp: new Date().toISOString(),
                testArray: [1, 2, 3, 4, 5],
                testObject: { name: 'test', value: 123 },
                koreanText: '한글 테스트 데이터입니다.'
            };
            
            const testFile = path.join(TEST_CONFIG.testDataDir, 'test-integrity.json');
            await fs.ensureDir(TEST_CONFIG.testDataDir);
            
            // 저장
            await fs.writeJson(testFile, testData, { spaces: 2 });
            
            // 읽기
            const readData = await fs.readJson(testFile);
            
            // 검증
            if (JSON.stringify(testData) !== JSON.stringify(readData)) {
                throw new Error('저장된 데이터와 읽은 데이터가 일치하지 않습니다.');
            }
            
            // 정리
            await fs.remove(testFile);
            
            return { success: true };
        }, 'File I/O Test');
        
        scenario.tests.push(fileTest);
        
        if (fileTest.success) {
            log.success('파일 저장/읽기 테스트 성공');
        } else {
            log.error(`파일 테스트 실패: ${fileTest.error}`);
        }
        
        // 3-2. JSON 구조 검증
        log.info('JSON 데이터 구조 검증 중...');
        const jsonValidationTest = await measureTime(async () => {
            const errors = [];
            
            // 기사 데이터 구조 확인
            const articlesPath = path.join(TEST_CONFIG.dataDir, 'articles/hr-articles-latest.json');
            if (await fs.pathExists(articlesPath)) {
                const data = await fs.readJson(articlesPath);
                
                if (!data.metadata || !data.articles) {
                    errors.push('기사 데이터 구조가 올바르지 않습니다.');
                }
                
                if (data.articles && data.articles.length > 0) {
                    const article = data.articles[0];
                    const requiredFields = ['title', 'url', 'summary', 'publishDate', 'source'];
                    
                    requiredFields.forEach(field => {
                        if (!article[field]) {
                            errors.push(`기사 데이터에 ${field} 필드가 없습니다.`);
                        }
                    });
                }
            }
            
            if (errors.length > 0) {
                throw new Error(errors.join(', '));
            }
            
            return { validated: true };
        }, 'JSON Validation');
        
        scenario.tests.push(jsonValidationTest);
        
        if (jsonValidationTest.success) {
            log.success('JSON 구조 검증 성공');
        } else {
            log.error(`JSON 검증 실패: ${jsonValidationTest.error}`);
        }
        
        // 3-3. 중복 데이터 처리 테스트
        log.info('중복 데이터 처리 테스트 중...');
        const duplicateTest = await measureTime(async () => {
            const testArticles = [
                { title: '제목1', url: 'http://test1.com', content: '내용1' },
                { title: '제목2', url: 'http://test2.com', content: '내용2' },
                { title: '제목1', url: 'http://test1.com', content: '내용1' }, // 중복
                { title: '제목3', url: 'http://test3.com', content: '내용3' }
            ];
            
            // 중복 제거
            const seen = new Set();
            const unique = testArticles.filter(article => {
                const key = `${article.title}-${article.url}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            
            if (unique.length !== 3) {
                throw new Error(`중복 제거 실패: ${unique.length}개 (예상: 3개)`);
            }
            
            return { originalCount: testArticles.length, uniqueCount: unique.length };
        }, 'Duplicate Handling');
        
        scenario.tests.push(duplicateTest);
        
        if (duplicateTest.success) {
            log.success(`중복 제거 성공: ${duplicateTest.result.originalCount}개 → ${duplicateTest.result.uniqueCount}개`);
        } else {
            log.error(`중복 처리 실패: ${duplicateTest.error}`);
        }
        
    } catch (error) {
        log.error(`데이터 무결성 테스트 실패: ${error.message}`);
        scenario.error = error.message;
    }
    
    scenario.endTime = new Date();
    scenario.duration = scenario.endTime - scenario.startTime;
    testResults.scenarios.push(scenario);
}

// 4. 성능 테스트
async function testPerformance() {
    log.section('4. 성능 테스트');
    
    const scenario = {
        name: 'Performance',
        tests: [],
        startTime: new Date()
    };
    
    try {
        // 4-1. 메모리 사용량 모니터링
        log.info('메모리 사용량 측정 중...');
        const memoryTest = await measureTime(async () => {
            const initialMemory = await checkMemoryUsage();
            
            // 메모리 집약적 작업 수행
            const largeArray = Array(1000000).fill('테스트 데이터');
            const processedArray = largeArray.map(item => item.toUpperCase());
            
            const afterMemory = await checkMemoryUsage();
            
            // 가비지 컬렉션 강제 실행 (가능한 경우)
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = await checkMemoryUsage();
            
            return {
                initial: initialMemory,
                peak: afterMemory,
                final: finalMemory,
                peakUsage: afterMemory.heapUsed - initialMemory.heapUsed
            };
        }, 'Memory Usage');
        
        scenario.tests.push(memoryTest);
        
        if (memoryTest.success) {
            log.success(`메모리 사용량: 초기 ${memoryTest.result.initial.heapUsed}MB → 최대 ${memoryTest.result.peak.heapUsed}MB → 최종 ${memoryTest.result.final.heapUsed}MB`);
        } else {
            log.error(`메모리 테스트 실패: ${memoryTest.error}`);
        }
        
        // 4-2. 처리 속도 벤치마크
        log.info('처리 속도 벤치마크 중...');
        const benchmarkTest = await measureTime(async () => {
            const iterations = 1000;
            const results = {
                stringProcessing: 0,
                arrayOperations: 0,
                jsonParsing: 0
            };
            
            // 문자열 처리 속도
            const start1 = Date.now();
            for (let i = 0; i < iterations; i++) {
                const str = `테스트 문자열 ${i}`.repeat(10);
                str.split(' ').join('-').toUpperCase();
            }
            results.stringProcessing = Date.now() - start1;
            
            // 배열 연산 속도
            const start2 = Date.now();
            for (let i = 0; i < iterations; i++) {
                const arr = Array(100).fill(i);
                arr.map(x => x * 2).filter(x => x > 50).reduce((a, b) => a + b, 0);
            }
            results.arrayOperations = Date.now() - start2;
            
            // JSON 파싱 속도
            const testJson = JSON.stringify({ data: Array(100).fill({ id: 1, name: 'test' }) });
            const start3 = Date.now();
            for (let i = 0; i < iterations; i++) {
                JSON.parse(testJson);
            }
            results.jsonParsing = Date.now() - start3;
            
            return results;
        }, 'Processing Benchmark');
        
        scenario.tests.push(benchmarkTest);
        
        if (benchmarkTest.success) {
            log.success(`벤치마크 완료: 문자열 ${benchmarkTest.result.stringProcessing}ms, 배열 ${benchmarkTest.result.arrayOperations}ms, JSON ${benchmarkTest.result.jsonParsing}ms`);
        } else {
            log.error(`벤치마크 실패: ${benchmarkTest.error}`);
        }
        
        // 4-3. 동시 요청 처리 능력 (Job Manager)
        log.info('동시 작업 처리 테스트 중...');
        const concurrencyTest = await measureTime(async () => {
            const jobManager = getJobManager({ maxConcurrent: 3 });
            
            // 여러 작업 동시 생성
            const jobs = [];
            for (let i = 0; i < 5; i++) {
                const job = jobManager.createJob(JobTypes.STYLE_UPDATE, {
                    targetUrls: [`https://example.com/test${i}`]
                });
                jobs.push(job);
            }
            
            // 모든 작업 큐에 추가
            const startTime = Date.now();
            for (const job of jobs) {
                await jobManager.enqueueJob(job);
            }
            
            // 큐 상태 확인
            const status = jobManager.getStatus();
            
            return {
                totalJobs: jobs.length,
                queueLength: status.queueLength,
                runningJobs: status.runningJobs,
                maxConcurrent: 3
            };
        }, 'Concurrency Test');
        
        scenario.tests.push(concurrencyTest);
        
        if (concurrencyTest.success) {
            log.success(`동시 처리 테스트 완료: ${concurrencyTest.result.totalJobs}개 작업, 동시 실행 ${concurrencyTest.result.runningJobs}/${concurrencyTest.result.maxConcurrent}`);
        } else {
            log.error(`동시 처리 테스트 실패: ${concurrencyTest.error}`);
        }
        
    } catch (error) {
        log.error(`성능 테스트 실패: ${error.message}`);
        scenario.error = error.message;
    }
    
    scenario.endTime = new Date();
    scenario.duration = scenario.endTime - scenario.startTime;
    testResults.scenarios.push(scenario);
}

// 5. 사용자 시나리오 테스트
async function testUserScenarios() {
    log.section('5. 사용자 시나리오 테스트');
    
    const scenario = {
        name: 'User Scenarios',
        tests: [],
        startTime: new Date()
    };
    
    try {
        // 5-1. 대시보드 접근 테스트
        log.info('대시보드 접근 테스트 중...');
        const dashboardTest = await measureTime(async () => {
            try {
                const response = await axios.get(TEST_CONFIG.apiUrl);
                
                if (response.status !== 200) {
                    throw new Error(`대시보드 접근 실패: ${response.status}`);
                }
                
                // HTML 응답 확인
                if (!response.data.includes('HR 콘텐츠 자동화')) {
                    throw new Error('대시보드 페이지가 올바르게 로드되지 않았습니다.');
                }
                
                return { success: true };
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('서버가 실행되고 있지 않습니다.');
                }
                throw error;
            }
        }, 'Dashboard Access');
        
        scenario.tests.push(dashboardTest);
        
        if (dashboardTest.success) {
            log.success('대시보드 접근 성공');
        } else {
            log.error(`대시보드 테스트 실패: ${dashboardTest.error}`);
        }
        
        // 5-2. 글 생성 워크플로우 시뮬레이션
        log.info('글 생성 워크플로우 시뮬레이션 중...');
        const workflowSimulation = await measureTime(async () => {
            const steps = [];
            
            // Step 1: 기사 수집 요청
            steps.push({
                name: '기사 수집 요청',
                action: async () => {
                    const response = await axios.post(`${TEST_CONFIG.apiUrl}/api/scrape`);
                    return response.data;
                }
            });
            
            // Step 2: 필터링 요청
            steps.push({
                name: '기사 필터링 요청',
                action: async () => {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 대기
                    const response = await axios.post(`${TEST_CONFIG.apiUrl}/api/filter`);
                    return response.data;
                }
            });
            
            // Step 3: 상태 확인
            steps.push({
                name: '작업 상태 확인',
                action: async () => {
                    const response = await axios.get(`${TEST_CONFIG.apiUrl}/api/jobs/status`);
                    return response.data;
                }
            });
            
            const results = [];
            for (const step of steps) {
                try {
                    const result = await step.action();
                    results.push({ step: step.name, success: true, data: result });
                } catch (error) {
                    results.push({ step: step.name, success: false, error: error.message });
                }
            }
            
            return results;
        }, 'Workflow Simulation');
        
        scenario.tests.push(workflowSimulation);
        
        if (workflowSimulation.success) {
            const successCount = workflowSimulation.result.filter(r => r.success).length;
            log.success(`워크플로우 시뮬레이션 완료: ${successCount}/${workflowSimulation.result.length} 단계 성공`);
        } else {
            log.error(`워크플로우 시뮬레이션 실패: ${workflowSimulation.error}`);
        }
        
        // 5-3. 에러 상황 대응 테스트
        log.info('에러 상황 대응 테스트 중...');
        const errorHandlingTest = await measureTime(async () => {
            const errorTests = [];
            
            // 잘못된 Job ID로 조회
            try {
                await axios.get(`${TEST_CONFIG.apiUrl}/api/jobs/invalid-job-id`);
                errorTests.push({ test: 'Invalid Job ID', handled: false });
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    errorTests.push({ test: 'Invalid Job ID', handled: true });
                } else {
                    errorTests.push({ test: 'Invalid Job ID', handled: false, error: error.message });
                }
            }
            
            // 잘못된 API 엔드포인트
            try {
                await axios.get(`${TEST_CONFIG.apiUrl}/api/nonexistent`);
                errorTests.push({ test: 'Invalid Endpoint', handled: false });
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    errorTests.push({ test: 'Invalid Endpoint', handled: true });
                } else {
                    errorTests.push({ test: 'Invalid Endpoint', handled: false, error: error.message });
                }
            }
            
            const handledCount = errorTests.filter(t => t.handled).length;
            return {
                total: errorTests.length,
                handled: handledCount,
                tests: errorTests
            };
        }, 'Error Handling');
        
        scenario.tests.push(errorHandlingTest);
        
        if (errorHandlingTest.success) {
            log.success(`에러 처리 테스트 완료: ${errorHandlingTest.result.handled}/${errorHandlingTest.result.total} 에러 정상 처리`);
        } else {
            log.error(`에러 처리 테스트 실패: ${errorHandlingTest.error}`);
        }
        
    } catch (error) {
        log.error(`사용자 시나리오 테스트 실패: ${error.message}`);
        scenario.error = error.message;
    }
    
    scenario.endTime = new Date();
    scenario.duration = scenario.endTime - scenario.startTime;
    testResults.scenarios.push(scenario);
}

// 테스트 결과 리포트 생성
async function generateReport() {
    log.section('테스트 결과 리포트');
    
    testResults.endTime = new Date();
    testResults.totalDuration = testResults.endTime - testResults.startTime;
    
    // 전체 결과 계산
    testResults.scenarios.forEach(scenario => {
        testResults.summary.total += scenario.tests.length;
        testResults.summary.passed += scenario.tests.filter(t => t.success && !t.skipped).length;
        testResults.summary.failed += scenario.tests.filter(t => !t.success).length;
        testResults.summary.skipped += scenario.tests.filter(t => t.skipped).length;
    });
    
    // 콘솔 출력
    console.log('\n' + chalk.bold('='.repeat(60)));
    console.log(chalk.bold.white('통합 테스트 결과'));
    console.log(chalk.bold('='.repeat(60)));
    
    console.log(`\n실행 시간: ${new Date(testResults.startTime).toLocaleString()} ~ ${new Date(testResults.endTime).toLocaleString()}`);
    console.log(`총 소요 시간: ${Math.round(testResults.totalDuration / 1000)}초`);
    
    console.log('\n시나리오별 결과:');
    testResults.scenarios.forEach(scenario => {
        const passed = scenario.tests.filter(t => t.success && !t.skipped).length;
        const failed = scenario.tests.filter(t => !t.success).length;
        const skipped = scenario.tests.filter(t => t.skipped).length;
        
        const icon = failed > 0 ? chalk.red('✗') : chalk.green('✓');
        console.log(`${icon} ${scenario.name}: ${passed}/${scenario.tests.length} 성공${failed > 0 ? `, ${failed} 실패` : ''}${skipped > 0 ? `, ${skipped} 건너뜀` : ''}`);
        
        scenario.tests.forEach(test => {
            const testIcon = test.success ? (test.skipped ? chalk.yellow('-') : chalk.green('✓')) : chalk.red('✗');
            const duration = test.duration ? ` (${test.duration}ms)` : '';
            console.log(`  ${testIcon} ${test.name}${duration}`);
            if (!test.success && test.error) {
                console.log(chalk.red(`     → ${test.error}`));
            }
        });
    });
    
    console.log('\n' + chalk.bold('전체 요약:'));
    console.log(`총 테스트: ${testResults.summary.total}`);
    console.log(chalk.green(`성공: ${testResults.summary.passed}`));
    console.log(chalk.red(`실패: ${testResults.summary.failed}`));
    console.log(chalk.yellow(`건너뜀: ${testResults.summary.skipped}`));
    console.log(`성공률: ${Math.round((testResults.summary.passed / testResults.summary.total) * 100)}%`);
    
    // 파일로 저장
    const reportPath = path.join(__dirname, `integration-test-report-${Date.now()}.json`);
    await fs.writeJson(reportPath, testResults, { spaces: 2 });
    console.log(`\n📄 상세 리포트 저장됨: ${reportPath}`);
    
    // HTML 리포트 생성
    const htmlReport = generateHTMLReport(testResults);
    const htmlPath = reportPath.replace('.json', '.html');
    await fs.writeFile(htmlPath, htmlReport, 'utf8');
    console.log(`📄 HTML 리포트 저장됨: ${htmlPath}`);
    
    return testResults.summary.failed === 0;
}

// HTML 리포트 생성
function generateHTMLReport(results) {
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>통합 테스트 리포트 - ${new Date(results.startTime).toLocaleDateString()}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1, h2 { color: #333; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .stat-box { flex: 1; padding: 20px; border-radius: 5px; text-align: center; }
        .stat-box.success { background: #d4edda; color: #155724; }
        .stat-box.failed { background: #f8d7da; color: #721c24; }
        .stat-box.skipped { background: #fff3cd; color: #856404; }
        .stat-box.total { background: #d1ecf1; color: #0c5460; }
        .scenario { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .test { margin: 10px 20px; padding: 10px; background: #f9f9f9; border-left: 3px solid #ddd; }
        .test.success { border-left-color: #28a745; }
        .test.failed { border-left-color: #dc3545; background: #fff5f5; }
        .test.skipped { border-left-color: #ffc107; }
        .duration { color: #666; font-size: 0.9em; }
        .error { color: #dc3545; margin-top: 5px; font-size: 0.9em; }
        .progress-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 20px 0; }
        .progress { height: 100%; background: #28a745; transition: width 0.3s; }
    </style>
</head>
<body>
    <div class="container">
        <h1>HR 콘텐츠 자동화 - 통합 테스트 리포트</h1>
        <p>실행 시간: ${new Date(results.startTime).toLocaleString()} ~ ${new Date(results.endTime).toLocaleString()}</p>
        <p>총 소요 시간: ${Math.round(results.totalDuration / 1000)}초</p>
        
        <div class="summary">
            <div class="stat-box total">
                <h3>총 테스트</h3>
                <h2>${results.summary.total}</h2>
            </div>
            <div class="stat-box success">
                <h3>성공</h3>
                <h2>${results.summary.passed}</h2>
            </div>
            <div class="stat-box failed">
                <h3>실패</h3>
                <h2>${results.summary.failed}</h2>
            </div>
            <div class="stat-box skipped">
                <h3>건너뜀</h3>
                <h2>${results.summary.skipped}</h2>
            </div>
        </div>
        
        <div class="progress-bar">
            <div class="progress" style="width: ${(results.summary.passed / results.summary.total) * 100}%"></div>
        </div>
        <p style="text-align: center;">성공률: ${Math.round((results.summary.passed / results.summary.total) * 100)}%</p>
        
        <h2>시나리오별 결과</h2>
        ${results.scenarios.map(scenario => `
            <div class="scenario">
                <h3>${scenario.name}</h3>
                <p class="duration">소요 시간: ${Math.round(scenario.duration / 1000)}초</p>
                ${scenario.tests.map(test => `
                    <div class="test ${test.success ? (test.skipped ? 'skipped' : 'success') : 'failed'}">
                        <strong>${test.name}</strong>
                        ${test.duration ? `<span class="duration"> (${test.duration}ms)</span>` : ''}
                        ${test.error ? `<div class="error">오류: ${test.error}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>
</body>
</html>
    `;
}

// 메인 테스트 실행 함수
async function runIntegrationTests() {
    console.log(chalk.bold.cyan('\n🚀 HR 콘텐츠 자동화 시스템 - 통합 테스트 시작\n'));
    
    try {
        // 테스트 디렉토리 준비
        await fs.ensureDir(TEST_CONFIG.testDataDir);
        
        // 각 시나리오 실행
        await testFullWorkflow();
        await testAPIIntegration();
        await testDataIntegrity();
        await testPerformance();
        await testUserScenarios();
        
        // 리포트 생성
        const success = await generateReport();
        
        // 테스트 디렉토리 정리
        await fs.remove(TEST_CONFIG.testDataDir);
        
        if (success) {
            console.log(chalk.bold.green('\n✅ 모든 테스트가 성공적으로 완료되었습니다!\n'));
            process.exit(0);
        } else {
            console.log(chalk.bold.red('\n❌ 일부 테스트가 실패했습니다.\n'));
            process.exit(1);
        }
        
    } catch (error) {
        console.error(chalk.bold.red('\n💥 테스트 실행 중 치명적 오류 발생:'), error);
        process.exit(1);
    }
}

// 모듈 내보내기 또는 직접 실행
if (require.main === module) {
    runIntegrationTests();
} else {
    module.exports = {
        runIntegrationTests,
        testFullWorkflow,
        testAPIIntegration,
        testDataIntegrity,
        testPerformance,
        testUserScenarios
    };
}