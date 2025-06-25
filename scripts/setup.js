#!/usr/bin/env node

/**
 * HR 콘텐츠 자동화 시스템 초기 설정 스크립트
 * 
 * 이 스크립트는 시스템 첫 실행 시 필요한 디렉토리 구조를 생성하고
 * 환경 설정을 검증합니다.
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

console.log('🚀 HR 콘텐츠 자동화 시스템 설정을 시작합니다...\n');

// 필요한 디렉토리 구조
const directories = [
    'data/articles',
    'data/analysis',
    'data/drafts',
    'data/quality',
    'data/dashboard',
    'data/workflows',
    'data/workflows/backups',
    'data/workflows/records',
    'data/backups',
    'data/approvals',
    'logs',
    'temp'
];

// 생성해야 할 초기 파일들
const initialFiles = {
    'data/analysis/style-template.json': {
        metadata: {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            description: '브런치 스타일 분석 템플릿'
        },
        templates: {
            title: [
                "효과적인 [주제] 전략에 대한 이야기",
                "성공적인 [주제] 경험을 공유합니다",
                "[주제]를 위한 5가지 실무 팁",
                "직장인이라면 알아야 할 [주제] 이야기",
                "요즘 핫한 [주제] 트렌드 분석"
            ],
            structure: {
                introduction: "개인적인 경험이나 최근 이슈로 시작",
                development: "구체적인 사례와 데이터 제시", 
                insight: "개인적인 분석과 통찰 공유",
                application: "실무에 적용할 수 있는 방법",
                conclusion: "감성적이면서도 실용적인 마무리"
            },
            tone: {
                style: "친근하고 개인적인",
                voice: "경험을 바탕으로 한 조언자",
                emotion: "공감과 이해를 바탕으로 한"
            }
        }
    }
};

async function setupDirectories() {
    console.log('📁 디렉토리 구조 생성 중...');
    
    for (const dir of directories) {
        const fullPath = path.join(__dirname, '..', dir);
        await fs.ensureDir(fullPath);
        console.log(`   ✅ ${dir}`);
    }
    
    console.log('');
}

async function createInitialFiles() {
    console.log('📄 초기 파일 생성 중...');
    
    for (const [filePath, content] of Object.entries(initialFiles)) {
        const fullPath = path.join(__dirname, '..', filePath);
        
        if (!await fs.pathExists(fullPath)) {
            await fs.writeJson(fullPath, content, { spaces: 2 });
            console.log(`   ✅ ${filePath}`);
        } else {
            console.log(`   ⏭️  ${filePath} (이미 존재)`);
        }
    }
    
    console.log('');
}

async function checkEnvironmentFile() {
    console.log('🔧 환경 설정 파일 확인 중...');
    
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    
    if (!await fs.pathExists(envPath)) {
        if (await fs.pathExists(envExamplePath)) {
            await fs.copy(envExamplePath, envPath);
            console.log('   ✅ .env 파일이 .env.example에서 생성되었습니다');
            
            // 기본 SESSION_SECRET 생성
            const envContent = await fs.readFile(envPath, 'utf8');
            const sessionSecret = crypto.randomBytes(32).toString('hex');
            const updatedContent = envContent.replace(
                /SESSION_SECRET=.*/,
                `SESSION_SECRET=${sessionSecret}`
            );
            await fs.writeFile(envPath, updatedContent);
            console.log('   ✅ 랜덤 SESSION_SECRET이 생성되었습니다');
            
        } else {
            console.log('   ❌ .env.example 파일을 찾을 수 없습니다');
            return false;
        }
    } else {
        console.log('   ⏭️  .env 파일이 이미 존재합니다');
    }
    
    console.log('');
    return true;
}

async function validateEnvironment() {
    console.log('✅ 환경 변수 검증 중...');
    
    require('dotenv').config();
    
    const requiredEnvVars = [
        'ANTHROPIC_API_KEY',
        'SESSION_SECRET'
    ];
    
    const missingVars = [];
    const warnings = [];
    
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingVars.push(envVar);
        } else if (envVar === 'ANTHROPIC_API_KEY' && process.env[envVar].includes('your_')) {
            warnings.push(`${envVar}: 기본값을 실제 API 키로 변경해주세요`);
        } else if (envVar === 'SESSION_SECRET' && process.env[envVar].includes('your_')) {
            warnings.push(`${envVar}: 보안을 위해 랜덤 문자열로 변경해주세요`);
        } else {
            console.log(`   ✅ ${envVar}: 설정됨`);
        }
    }
    
    if (missingVars.length > 0) {
        console.log('\n   ❌ 필수 환경 변수가 누락되었습니다:');
        missingVars.forEach(envVar => {
            console.log(`      - ${envVar}`);
        });
    }
    
    if (warnings.length > 0) {
        console.log('\n   ⚠️  확인이 필요한 환경 변수:');
        warnings.forEach(warning => {
            console.log(`      - ${warning}`);
        });
    }
    
    console.log('');
    return missingVars.length === 0;
}

async function createGitignore() {
    console.log('📝 .gitignore 파일 확인 중...');
    
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    
    const gitignoreContent = `# 환경 변수
.env
.env.local
.env.production

# 로그 파일
logs/
*.log

# 임시 파일
temp/
tmp/

# 데이터 파일
data/
!data/.gitkeep

# 백업 파일
backup/
backups/

# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS 생성 파일
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE 설정
.vscode/
.idea/
*.swp
*.swo

# 브라우저 데이터 (Puppeteer)
.puppeteerrc.json

# 테스트 커버리지
coverage/

# PM2 설정
ecosystem.config.js
`;

    if (!await fs.pathExists(gitignorePath)) {
        await fs.writeFile(gitignorePath, gitignoreContent);
        console.log('   ✅ .gitignore 파일이 생성되었습니다');
    } else {
        console.log('   ⏭️  .gitignore 파일이 이미 존재합니다');
    }
    
    console.log('');
}

async function createPackageScriptsHelper() {
    console.log('📜 패키지 스크립트 도움말 생성 중...');
    
    const helpPath = path.join(__dirname, '..', 'SCRIPTS.md');
    
    const helpContent = `# 📋 HR 콘텐츠 자동화 시스템 스크립트 가이드

## 🚀 시스템 설정 및 시작

\`\`\`bash
# 전체 시스템 설치 및 설정 확인
npm install
npm run setup
npm run verify

# 개발 서버 시작
npm run dev

# 프로덕션 서버 시작
npm start
\`\`\`

## 🧪 테스트 실행

\`\`\`bash
# 전체 통합 테스트
npm test

# 개별 테스트 실행
npm run test:workflow     # 워크플로우 테스트
npm run test:api         # API 테스트
npm run test:data        # 데이터 무결성 테스트
npm run test:performance # 성능 테스트
npm run test:user        # 사용자 플로우 테스트
\`\`\`

## 🔧 각 모듈별 개별 실행

\`\`\`bash
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
\`\`\`

## 🏃‍♂️ 시스템 관리

\`\`\`bash
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
\`\`\`

## 🌐 웹 인터페이스

시스템이 실행되면 다음 주소에서 웹 인터페이스에 접근할 수 있습니다:

- **메인 대시보드**: http://localhost:3001/
- **기사 관리**: http://localhost:3001/articles
- **초안 관리**: http://localhost:3001/drafts
- **워크플로우 관리**: http://localhost:3001/workflows
- **통계**: http://localhost:3001/analytics

## ⚙️ 환경 설정

시스템 실행 전 \`.env\` 파일에서 다음 항목들을 설정해주세요:

\`\`\`bash
# 필수 설정
ANTHROPIC_API_KEY=your_claude_api_key_here
SESSION_SECRET=your_32_character_random_secret

# 브런치 자동 발행 (선택사항)
BRUNCH_EMAIL=your_brunch_email@example.com
BRUNCH_PASSWORD=your_brunch_password
\`\`\`
`;

    if (!await fs.pathExists(helpPath)) {
        await fs.writeFile(helpPath, helpContent);
        console.log('   ✅ SCRIPTS.md 도움말 파일이 생성되었습니다');
    } else {
        console.log('   ⏭️  SCRIPTS.md 파일이 이미 존재합니다');
    }
    
    console.log('');
}

async function main() {
    try {
        await setupDirectories();
        await createInitialFiles();
        await createGitignore();
        await createPackageScriptsHelper();
        
        const envSuccess = await checkEnvironmentFile();
        if (envSuccess) {
            const envValid = await validateEnvironment();
            
            console.log('🎉 설정이 완료되었습니다!\n');
            
            if (envValid) {
                console.log('✅ 모든 환경 변수가 올바르게 설정되었습니다.');
                console.log('\n다음 명령어로 시스템을 시작할 수 있습니다:');
                console.log('   npm run dev    # 개발 서버');
                console.log('   npm start      # 프로덕션 서버');
                console.log('\n테스트 실행:');
                console.log('   npm test       # 통합 테스트');
                console.log('   npm run verify # 시스템 검증');
            } else {
                console.log('⚠️  .env 파일에서 누락된 환경 변수를 설정한 후 시스템을 시작해주세요.');
            }
            
            console.log('\n📖 더 자세한 사용법은 SCRIPTS.md 파일을 참고해주세요.');
        }
        
    } catch (error) {
        console.error('❌ 설정 중 오류가 발생했습니다:', error.message);
        process.exit(1);
    }
}

// 스크립트가 직접 실행될 때만 main 함수 실행
if (require.main === module) {
    main();
}

module.exports = {
    setupDirectories,
    createInitialFiles,
    checkEnvironmentFile,
    validateEnvironment
};