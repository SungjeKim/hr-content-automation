#!/usr/bin/env node

/**
 * HR 콘텐츠 자동화 시스템 검증 스크립트
 * 
 * 이 스크립트는 시스템의 모든 구성요소가 올바르게 작동하는지
 * 종합적으로 검증합니다.
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

console.log('🔍 HR 콘텐츠 자동화 시스템 검증을 시작합니다...\n');

// 검증 결과 저장
const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    details: []
};

function addResult(type, category, test, status, message, details = null) {
    results[status]++;
    results.details.push({
        type,
        category,
        test,
        status,
        message,
        details,
        timestamp: new Date().toISOString()
    });
    
    const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⚠️';
    console.log(`   ${icon} ${test}: ${message}`);
    if (details) {
        console.log(`      상세: ${details}`);
    }
}

async function verifyEnvironment() {
    console.log('🔧 환경 설정 검증 중...');
    
    // .env 파일 존재 확인
    const envPath = path.join(__dirname, '..', '.env');
    if (await fs.pathExists(envPath)) {
        addResult('environment', 'files', '.env 파일', 'passed', '환경 설정 파일이 존재합니다');
    } else {
        addResult('environment', 'files', '.env 파일', 'failed', '환경 설정 파일이 없습니다', 'npm run setup을 실행해주세요');
        return;
    }
    
    // 환경 변수 로드
    require('dotenv').config();
    
    // 필수 환경 변수 확인
    const requiredVars = [
        { name: 'ANTHROPIC_API_KEY', description: 'Claude API 키' },
        { name: 'SESSION_SECRET', description: '세션 보안 키' }
    ];
    
    for (const envVar of requiredVars) {
        if (process.env[envVar]) {
            if (process.env[envVar].includes('your_') || process.env[envVar].includes('here')) {
                addResult('environment', 'variables', envVar.name, 'warnings', 
                    `${envVar.description}가 기본값입니다`, '실제 값으로 변경해주세요');
            } else {
                addResult('environment', 'variables', envVar.name, 'passed', 
                    `${envVar.description}가 설정되었습니다`);
            }
        } else {
            addResult('environment', 'variables', envVar.name, 'failed', 
                `${envVar.description}가 누락되었습니다`, '.env 파일에서 설정해주세요');
        }
    }
    
    // 선택적 환경 변수 확인
    const optionalVars = [
        { name: 'BRUNCH_EMAIL', description: '브런치 이메일' },
        { name: 'BRUNCH_PASSWORD', description: '브런치 비밀번호' }
    ];
    
    for (const envVar of optionalVars) {
        if (process.env[envVar] && !process.env[envVar].includes('your_')) {
            addResult('environment', 'variables', envVar.name, 'passed', 
                `${envVar.description}가 설정되었습니다 (브런치 자동 발행 가능)`);
        } else {
            addResult('environment', 'variables', envVar.name, 'warnings', 
                `${envVar.description}가 설정되지 않았습니다`, '브런치 자동 발행을 사용하려면 설정해주세요');
        }
    }
    
    console.log('');
}

async function verifyDirectoryStructure() {
    console.log('📁 디렉토리 구조 검증 중...');
    
    const requiredDirs = [
        'src',
        'src/analyzers',
        'src/scrapers', 
        'src/writers',
        'src/workflows',
        'src/publishers',
        'src/jobs',
        'data',
        'data/articles',
        'data/analysis',
        'data/drafts',
        'data/quality',
        'data/workflows',
        'views',
        'views/partials',
        'test',
        'scripts'
    ];
    
    for (const dir of requiredDirs) {
        const dirPath = path.join(__dirname, '..', dir);
        if (await fs.pathExists(dirPath)) {
            addResult('structure', 'directories', dir, 'passed', '디렉토리가 존재합니다');
        } else {
            addResult('structure', 'directories', dir, 'failed', '디렉토리가 없습니다', 'npm run setup을 실행해주세요');
        }
    }
    
    console.log('');
}

async function verifySourceFiles() {
    console.log('📄 소스 파일 검증 중...');
    
    const criticalFiles = [
        'src/app.js',
        'src/brunchAnalyzer-simple.js',
        'src/scrapers/hrContentScraper.js',
        'src/analyzers/contentFilter.js',
        'src/writers/articleWriter.js',
        'src/analyzers/qualityChecker.js',
        'src/workflows/contentCreation.js',
        'src/workflows/publishingWorkflow.js',
        'src/publishers/brunchPublisher.js',
        'src/jobs/jobManager.js',
        'src/scheduler.js',
        'production.js',
        'package.json'
    ];
    
    for (const file of criticalFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (await fs.pathExists(filePath)) {
            addResult('files', 'source', file, 'passed', '소스 파일이 존재합니다');
        } else {
            addResult('files', 'source', file, 'failed', '소스 파일이 없습니다');
        }
    }
    
    console.log('');
}

async function verifyDependencies() {
    console.log('📦 의존성 패키지 검증 중...');
    
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    
    if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
        
        if (await fs.pathExists(nodeModulesPath)) {
            addResult('dependencies', 'installation', 'node_modules', 'passed', 'npm 패키지가 설치되었습니다');
            
            // 주요 의존성 확인
            const criticalDeps = [
                '@anthropic-ai/sdk',
                'express',
                'puppeteer',
                'axios',
                'cheerio',
                'fs-extra',
                'socket.io'
            ];
            
            for (const dep of criticalDeps) {
                const depPath = path.join(nodeModulesPath, dep);
                if (await fs.pathExists(depPath)) {
                    addResult('dependencies', 'packages', dep, 'passed', '패키지가 설치되었습니다');
                } else {
                    addResult('dependencies', 'packages', dep, 'failed', '패키지가 설치되지 않았습니다', 'npm install을 실행해주세요');
                }
            }
        } else {
            addResult('dependencies', 'installation', 'node_modules', 'failed', 'npm 패키지가 설치되지 않았습니다', 'npm install을 실행해주세요');
        }
    } else {
        addResult('dependencies', 'configuration', 'package.json', 'failed', 'package.json 파일이 없습니다');
    }
    
    console.log('');
}

async function verifyModuleImports() {
    console.log('🔌 모듈 임포트 검증 중...');
    
    const modules = [
        { path: './src/scrapers/hrContentScraper', name: 'HRContentScraper' },
        { path: './src/analyzers/contentFilter', name: 'ContentFilter' },
        { path: './src/writers/articleWriter', name: 'ArticleWriter' },
        { path: './src/analyzers/qualityChecker', name: 'QualityChecker' },
        { path: './src/workflows/contentCreation', name: 'ContentCreationWorkflow' },
        { path: './src/workflows/publishingWorkflow', name: 'PublishingWorkflow' },
        { path: './src/publishers/brunchPublisher', name: 'BrunchPublisher' },
        { path: './src/jobs/jobManager', name: 'JobManager' }
    ];
    
    for (const module of modules) {
        try {
            const modulePath = path.join(__dirname, '..', module.path);
            const moduleExports = require(modulePath);
            
            if (moduleExports) {
                addResult('modules', 'imports', module.name, 'passed', '모듈을 성공적으로 로드했습니다');
            } else {
                addResult('modules', 'imports', module.name, 'failed', '모듈이 제대로 export되지 않았습니다');
            }
        } catch (error) {
            addResult('modules', 'imports', module.name, 'failed', '모듈 로드에 실패했습니다', error.message);
        }
    }
    
    console.log('');
}

async function verifyAPIConnectivity() {
    console.log('🌐 API 연결성 검증 중...');
    
    // Claude API 연결 테스트
    if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your_')) {
        try {
            const Anthropic = require('@anthropic-ai/sdk');
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });
            
            // 간단한 API 호출 테스트
            const message = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 10,
                messages: [{ role: "user", content: "Hello" }]
            });
            
            if (message && message.content) {
                addResult('api', 'connectivity', 'Claude API', 'passed', 'Claude API 연결이 성공했습니다');
            } else {
                addResult('api', 'connectivity', 'Claude API', 'failed', 'Claude API 응답이 올바르지 않습니다');
            }
        } catch (error) {
            if (error.message.includes('credit')) {
                addResult('api', 'connectivity', 'Claude API', 'warnings', 'Claude API 크레딧이 부족합니다', error.message);
            } else {
                addResult('api', 'connectivity', 'Claude API', 'failed', 'Claude API 연결에 실패했습니다', error.message);
            }
        }
    } else {
        addResult('api', 'connectivity', 'Claude API', 'warnings', 'Claude API 키가 설정되지 않았습니다', 'AI 기능을 사용하려면 설정해주세요');
    }
    
    console.log('');
}

async function verifyWebScraping() {
    console.log('🕷️ 웹 스크래핑 기능 검증 중...');
    
    try {
        // 간단한 HTTP 요청 테스트
        const response = await axios.get('https://httpbin.org/get', {
            timeout: 5000,
            headers: {
                'User-Agent': 'HR-Content-Automation-System/1.0.0'
            }
        });
        
        if (response.status === 200) {
            addResult('scraping', 'connectivity', 'HTTP 요청', 'passed', 'HTTP 요청이 성공했습니다');
        } else {
            addResult('scraping', 'connectivity', 'HTTP 요청', 'failed', `HTTP 요청이 실패했습니다 (${response.status})`);
        }
        
        // Cheerio 파싱 테스트
        const cheerio = require('cheerio');
        const $ = cheerio.load('<div>테스트</div>');
        
        if ($('div').text() === '테스트') {
            addResult('scraping', 'parsing', 'HTML 파싱', 'passed', 'HTML 파싱이 정상 작동합니다');
        } else {
            addResult('scraping', 'parsing', 'HTML 파싱', 'failed', 'HTML 파싱에 문제가 있습니다');
        }
        
    } catch (error) {
        addResult('scraping', 'connectivity', 'HTTP 요청', 'failed', '네트워크 연결에 문제가 있습니다', error.message);
    }
    
    console.log('');
}

async function verifyDataIntegrity() {
    console.log('💾 데이터 무결성 검증 중...');
    
    // 스타일 템플릿 파일 확인
    const styleTemplatePath = path.join(__dirname, '..', 'data/analysis/style-template.json');
    
    if (await fs.pathExists(styleTemplatePath)) {
        try {
            const template = await fs.readJson(styleTemplatePath);
            
            if (template.templates && template.templates.title && Array.isArray(template.templates.title)) {
                addResult('data', 'integrity', '스타일 템플릿', 'passed', '스타일 템플릿이 올바른 형식입니다');
            } else {
                addResult('data', 'integrity', '스타일 템플릿', 'failed', '스타일 템플릿 형식이 올바르지 않습니다');
            }
        } catch (error) {
            addResult('data', 'integrity', '스타일 템플릿', 'failed', '스타일 템플릿 파일을 읽을 수 없습니다', error.message);
        }
    } else {
        addResult('data', 'integrity', '스타일 템플릿', 'failed', '스타일 템플릿 파일이 없습니다', 'npm run setup을 실행해주세요');
    }
    
    console.log('');
}

function generateReport() {
    console.log('📊 검증 결과 요약');
    console.log('='.repeat(50));
    console.log(`✅ 통과: ${results.passed}개`);
    console.log(`❌ 실패: ${results.failed}개`);
    console.log(`⚠️  경고: ${results.warnings}개`);
    console.log(`📊 총 검사: ${results.passed + results.failed + results.warnings}개`);
    console.log('');
    
    if (results.failed === 0) {
        console.log('🎉 모든 핵심 기능이 정상적으로 작동합니다!');
        
        if (results.warnings > 0) {
            console.log('⚠️  일부 경고사항이 있지만 시스템은 정상 작동합니다.');
            console.log('   선택적 기능을 사용하려면 해당 설정을 완료해주세요.');
        }
        
        console.log('\n🚀 시스템을 시작할 준비가 되었습니다:');
        console.log('   npm run dev    # 개발 서버 시작');
        console.log('   npm start      # 프로덕션 서버 시작');
        
    } else {
        console.log('❌ 일부 필수 구성요소에 문제가 있습니다.');
        console.log('   실패한 항목들을 확인하고 수정한 후 다시 검증해주세요.');
        console.log('   npm run setup  # 초기 설정 재실행');
    }
    
    // 상세 리포트 저장
    const reportPath = path.join(__dirname, '..', 'verification-report.json');
    fs.writeJsonSync(reportPath, {
        timestamp: new Date().toISOString(),
        summary: {
            passed: results.passed,
            failed: results.failed,
            warnings: results.warnings,
            total: results.passed + results.failed + results.warnings
        },
        details: results.details
    }, { spaces: 2 });
    
    console.log(`\n📄 상세 검증 리포트가 저장되었습니다: verification-report.json`);
}

async function main() {
    try {
        await verifyEnvironment();
        await verifyDirectoryStructure();
        await verifySourceFiles();
        await verifyDependencies();
        await verifyModuleImports();
        await verifyAPIConnectivity();
        await verifyWebScraping();
        await verifyDataIntegrity();
        
        console.log('');
        generateReport();
        
        // 종료 코드 설정
        process.exit(results.failed > 0 ? 1 : 0);
        
    } catch (error) {
        console.error('❌ 검증 중 예상치 못한 오류가 발생했습니다:', error.message);
        process.exit(1);
    }
}

// 스크립트가 직접 실행될 때만 main 함수 실행
if (require.main === module) {
    main();
}

module.exports = {
    verifyEnvironment,
    verifyDirectoryStructure,
    verifySourceFiles,
    verifyDependencies,
    verifyModuleImports,
    verifyAPIConnectivity,
    verifyWebScraping,
    verifyDataIntegrity
};