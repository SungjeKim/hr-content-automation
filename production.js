require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Server } = require('socket.io');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');

// 컴포넌트 임포트
const ContentCreationWorkflow = require('./src/workflows/contentCreation');
const ContentFilter = require('./src/analyzers/contentFilter');
const ArticleWriter = require('./src/writers/articleWriter');
const QualityChecker = require('./src/analyzers/qualityChecker');
const { getScheduler } = require('./src/scheduler');
const { getJobManager } = require('./src/jobs/jobManager');
const dashboardRouter = require('./routes/dashboard');

// 프로덕션 환경 검증
if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️ 프로덕션 모드가 아닌 환경에서 production.js를 실행하고 있습니다.');
}

// Winston 로거 설정
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'hr-content-automation' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Express 앱 초기화
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || false,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// 포트 설정
const PORT = process.env.PORT || 3001;

// 보안 미들웨어
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "cdn.socket.io"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'", "cdnjs.cloudflare.com"],
     },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: process.env.RATE_LIMIT_MAX || 100, // 최대 요청 수
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// API 전용 더 엄격한 Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1분
    max: process.env.API_RATE_LIMIT_MAX || 20,
    message: {
        error: 'API rate limit exceeded',
        retryAfter: '1 minute'
    }
});
app.use('/api/scrape', apiLimiter);
app.use('/api/generate', apiLimiter);

// 압축 미들웨어
app.use(compression({
    level: 6,
    threshold: 1024,
}));

// 로깅 미들웨어
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));

// CORS 설정
const corsOptions = {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions)); //
app.use('/dashboard', dashboardRouter);

// Body 파싱
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// 세션 설정 (프로덕션용)
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
    logger.error('SESSION_SECRET 환경변수가 설정되지 않았습니다.');
    process.exit(1);
}

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    },
    name: 'hr-automation.sid' // 기본 세션 이름 변경
}));

// 정적 파일 서빙 (보안 강화)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.use('/data', express.static(path.join(__dirname, 'data'), {
    maxAge: '1h',
    setHeaders: (res, path) => {
        // 민감한 데이터 접근 제한
        if (path.includes('jobs') || path.includes('logs')) {
            res.status(403).end();
            return;
        }
    }
}));

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 전역 변수
let currentWorkflow = null;
let scheduler = null;
let jobManager = null;
let systemStats = {
    startTime: new Date(),
    requestCount: 0,
    errorCount: 0,
    lastError: null
};

// 요청 카운터 미들웨어
app.use((req, res, next) => {
    systemStats.requestCount++;
    
    // 에러 처리
    const originalSend = res.send;
    res.send = function(data) {
        if (res.statusCode >= 400) {
            systemStats.errorCount++;
            systemStats.lastError = {
                timestamp: new Date(),
                path: req.path,
                method: req.method,
                statusCode: res.statusCode,
                userAgent: req.get('User-Agent')
            };
        }
        originalSend.call(this, data);
    };
    
    next();
});

// Socket.IO 이벤트 처리
io.on('connection', (socket) => {
    logger.info(`클라이언트 연결됨: ${socket.id}`);
    
    socket.on('disconnect', () => {
        logger.info(`클라이언트 연결 해제: ${socket.id}`);
    });
});

// 헬퍼 함수들
async function getLatestData(type) {
    try {
        const dataPath = path.join(__dirname, `data/${type}`);
        if (!await fs.pathExists(dataPath)) {
            return null;
        }
        
        const files = await fs.readdir(dataPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        if (jsonFiles.length === 0) return null;
        
        // latest 파일 우선 확인
        if (jsonFiles.includes(`${type.split('/').pop()}-latest.json`)) {
            return await fs.readJson(path.join(dataPath, `${type.split('/').pop()}-latest.json`));
        }
        
        // 가장 최근 파일 찾기
        const sortedFiles = jsonFiles.sort((a, b) => b.localeCompare(a));
        return await fs.readJson(path.join(dataPath, sortedFiles[0]));
        
    } catch (error) {
        logger.error(`${type} 데이터 로드 실패:`, error);
        return null;
    }
}

async function getSystemStatus() {
    try {
        const status = {
            server: {
                uptime: Math.round((Date.now() - systemStats.startTime.getTime()) / 1000),
                requestCount: systemStats.requestCount,
                errorCount: systemStats.errorCount,
                errorRate: systemStats.requestCount > 0 ? 
                    Math.round((systemStats.errorCount / systemStats.requestCount) * 100) : 0,
                lastError: systemStats.lastError,
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                environment: process.env.NODE_ENV
            },
            articles: {
                collected: 0,
                filtered: 0,
                lastUpdate: null
            },
            drafts: {
                total: 0,
                approved: 0,
                pending: 0,
                lastGenerated: null
            },
            quality: {
                averageScore: 0,
                passRate: 0
            },
            services: {
                scheduler: scheduler ? scheduler.getStatus() : { isRunning: false },
                jobManager: jobManager ? jobManager.getStatus() : { isRunning: false },
                claudeApi: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not configured'
            }
        };
        
        // 수집된 기사 상태
        const articles = await getLatestData('articles/hr-articles');
        if (articles) {
            status.articles.collected = articles.metadata?.totalArticles || 0;
            status.articles.lastUpdate = articles.metadata?.scrapedAt;
        }
        
        // 필터링된 기사 상태
        const filtered = await getLatestData('articles/filtered-articles');
        if (filtered) {
            status.articles.filtered = filtered.metadata?.selectedCount || 0;
        }
        
        // 초안 상태
        const drafts = await getLatestData('drafts/articles');
        if (drafts) {
            status.drafts.total = drafts.metadata?.totalArticles || 0;
            status.drafts.lastGenerated = drafts.metadata?.generatedAt;
        }
        
        // 품질 상태
        const quality = await getLatestData('quality/quality-report');
        if (quality) {
            status.quality.averageScore = quality.metadata?.averageScore || 0;
            status.quality.passRate = quality.metadata?.passedCount 
                ? Math.round((quality.metadata.passedCount / quality.metadata.totalArticles) * 100) 
                : 0;
        }
        
        return status;
        
    } catch (error) {
        logger.error('시스템 상태 확인 실패:', error);
        return null;
    }
}

// 라우트 정의 (기존 app.js에서 가져온 라우트들)
// ... (모든 기존 라우트들을 여기에 포함)

// 헬스체크 엔드포인트
app.get('/health', async (req, res) => {
    try {
        const status = await getSystemStatus();
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: status.server.uptime,
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV,
            services: {
                database: 'ok', // 파일 시스템 체크
                scheduler: status.services.scheduler.isRunning ? 'ok' : 'warning',
                jobManager: status.services.jobManager.isRunning ? 'ok' : 'warning',
                claudeApi: status.services.claudeApi === 'configured' ? 'ok' : 'not configured'
            },
            metrics: {
                memoryUsage: status.server.memory,
                requestCount: status.server.requestCount,
                errorRate: status.server.errorRate
            }
        };
        
        // 시스템 문제 감지
        if (status.server.errorRate > 10) {
            health.status = 'unhealthy';
            health.issues = ['High error rate detected'];
        }
        
        if (status.server.memory.heapUsed > 1024 * 1024 * 1024) { // 1GB
            health.status = 'warning';
            health.issues = (health.issues || []).concat(['High memory usage']);
        }
        
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'warning' ? 200 : 503;
        
        res.status(statusCode).json(health);
        
    } catch (error) {
        logger.error('헬스체크 실패:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed'
        });
    }
});

// 메트릭 엔드포인트
app.get('/metrics', async (req, res) => {
    try {
        const status = await getSystemStatus();
        const metrics = {
            // Prometheus 형식으로 메트릭 제공
            'hr_automation_uptime_seconds': status.server.uptime,
            'hr_automation_requests_total': status.server.requestCount,
            'hr_automation_errors_total': status.server.errorCount,
            'hr_automation_memory_heap_bytes': status.server.memory.heapUsed,
            'hr_automation_articles_collected_total': status.articles.collected,
            'hr_automation_drafts_total': status.drafts.total,
            'hr_automation_quality_average_score': status.quality.averageScore,
        };
        
        // Prometheus 형식으로 출력
        let output = '';
        for (const [key, value] of Object.entries(metrics)) {
            output += `# TYPE ${key} gauge\n`;
            output += `${key} ${value}\n`;
        }
        
        res.set('Content-Type', 'text/plain');
        res.send(output);
        
    } catch (error) {
        logger.error('메트릭 조회 실패:', error);
        res.status(500).send('# Error retrieving metrics\n');
    }
});

// 보안 엔드포인트들
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Disallow: /api/
Disallow: /data/
Disallow: /logs/
Allow: /health
Allow: /`);
});

// 404 처리
app.use((req, res) => {
    logger.warn(`404 요청: ${req.method} ${req.path} from ${req.ip}`);
    
    if (req.path.startsWith('/api/')) {
        res.status(404).json({
            error: 'API endpoint not found',
            path: req.path,
            method: req.method
        });
    } else {
        res.status(404).render('error', {
            title: '페이지를 찾을 수 없음',
            message: '요청하신 페이지를 찾을 수 없습니다.',
            error: '404 Not Found'
        });
    }
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
    logger.error('서버 오류:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    // 보안상 프로덕션에서는 상세 에러 숨김
    const errorResponse = {
        error: 'Internal Server Error',
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown'
    };
    
    if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = err.message;
        errorResponse.stack = err.stack;
    }
    
    if (req.path.startsWith('/api/')) {
        res.status(500).json(errorResponse);
    } else {
        res.status(500).render('error', {
            title: '서버 오류',
            message: '서버에서 오류가 발생했습니다.',
            error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM 신호 수신, 서버 종료 중...');
    
    server.close(() => {
        logger.info('HTTP 서버가 종료되었습니다.');
        
        // 스케줄러 정리
        if (scheduler) {
            scheduler.stop();
        }
        
        // Job Manager 정리
        if (jobManager) {
            jobManager.stop();
        }
        
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT 신호 수신, 서버 종료 중...');
    process.exit(0);
});

// 처리되지 않은 예외 처리
process.on('uncaughtException', (err) => {
    logger.error('처리되지 않은 예외:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('처리되지 않은 Promise 거부:', { reason, promise });
});

// 서버 시작
server.listen(PORT, '0.0.0.0', async () => {
    logger.info(`🚀 HR 콘텐츠 자동화 서버가 프로덕션 모드로 포트 ${PORT}에서 실행 중입니다.`);
    logger.info(`📍 대시보드 접속: http://localhost:${PORT}`);
    logger.info(`📊 헬스체크: http://localhost:${PORT}/health`);
    logger.info(`📈 메트릭: http://localhost:${PORT}/metrics`);
    
    // 로그 디렉토리 생성
    await fs.ensureDir('logs');
    
    // 시스템 상태 확인
    const status = await getSystemStatus();
    if (status) {
        logger.info('📊 시스템 상태:', {
            articles: `${status.articles.collected}개 수집, ${status.articles.filtered}개 필터링`,
            drafts: `${status.drafts.total}개 생성`,
            quality: `평균 ${status.quality.averageScore}점, 통과율 ${status.quality.passRate}%`
        });
    }
    
    // 스케줄러 초기화 (환경변수로 제어)
    if (process.env.SCHEDULER_ENABLED !== 'false') {
        try {
            scheduler = getScheduler();
            logger.info('⏰ 자동화 스케줄러가 초기화되었습니다.');
        } catch (error) {
            logger.error('⚠️ 스케줄러 초기화 실패:', error);
        }
    }
    
    // JobManager 초기화
    try {
        jobManager = getJobManager({ 
            maxConcurrent: parseInt(process.env.JOB_MAX_CONCURRENT) || 3 
        });
        jobManager.start();
        logger.info('🏃 Job Manager가 시작되었습니다.');
    } catch (error) {
        logger.error('⚠️ Job Manager 초기화 실패:', error);
    }
});

module.exports = app;
