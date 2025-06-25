require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');

// 컴포넌트 임포트
const HRContentScraper = require('./scrapers/hrContentScraper');
const ContentFilter = require('./analyzers/contentFilter');
const ContentCreationWorkflow = require('./workflows/contentCreation');
const BrunchAnalyzer = require('./brunchAnalyzer-simple');

class SchedulerManager {
    constructor() {
        this.tasks = new Map();
        this.isRunning = false;
        this.logDir = path.join(__dirname, '../logs');
        this.logFile = path.join(this.logDir, 'scheduler.log');
        this.statsFile = path.join(this.logDir, 'scheduler-stats.json');
        
        // 환경 설정
        this.config = {
            enabled: process.env.SCHEDULER_ENABLED !== 'false',
            isDevelopment: process.env.NODE_ENV === 'development',
            notifications: process.env.SCHEDULER_NOTIFICATIONS !== 'false'
        };
        
        // 스케줄 설정 (개발/운영 환경별)
        this.schedules = this.config.isDevelopment ? {
            // 개발 환경: 테스트용 짧은 주기
            scrapeArticles: '*/10 * * * *', // 10분마다
            filterArticles: '*/15 * * * *', // 15분마다
            generateContent: '*/20 * * * *', // 20분마다
            reanalyzeStyle: '0 */6 * * *',  // 6시간마다
            generateReport: '0 0 */1 * *'   // 매일 자정
        } : {
            // 운영 환경: 실제 스케줄
            scrapeArticles: '0 9 * * *',    // 매일 오전 9:00
            filterArticles: '30 9 * * *',   // 매일 오전 9:30
            generateContent: '0 10 * * *',  // 매일 오전 10:00
            reanalyzeStyle: '0 0 * * 0',    // 매주 일요일 자정
            generateReport: '0 0 1 * *'     // 매월 1일 자정
        };
        
        // 통계 데이터
        this.stats = {
            totalExecutions: 0,
            successCount: 0,
            failureCount: 0,
            averageExecutionTime: 0,
            lastExecution: null,
            taskStats: {}
        };
        
        this.initializeScheduler();
    }
    
    async initializeScheduler() {
        try {
            // 로그 디렉토리 생성
            await fs.ensureDir(this.logDir);
            
            // 기존 통계 로드
            await this.loadStats();
            
            // JobManager 초기화
            const { getJobManager } = require('./jobs/jobManager');
            const jobManager = getJobManager({ maxConcurrent: 2 });
            jobManager.start();
            
            // 스케줄 작업 등록
            this.registerTasks();
            
            // 시작 로그
            await this.log('스케줄러 초기화 완료', 'system', 'info');
            
            if (this.config.enabled) {
                this.start();
            } else {
                await this.log('스케줄러가 비활성화 상태입니다. SCHEDULER_ENABLED=true로 설정하여 활성화하세요.', 'system', 'warn');
            }
            
        } catch (error) {
            await this.log(`스케줄러 초기화 실패: ${error.message}`, 'system', 'error');
        }
    }
    
    registerTasks() {
        // 1. HR 기사 자동 수집
        this.tasks.set('scrapeArticles', {
            name: 'HR 기사 수집',
            cron: this.schedules.scrapeArticles,
            enabled: process.env.SCHEDULE_SCRAPE_ENABLED !== 'false',
            task: null,
            handler: this.scrapeArticlesHandler.bind(this)
        });
        
        // 2. 기사 필터링 및 분석
        this.tasks.set('filterArticles', {
            name: '기사 필터링',
            cron: this.schedules.filterArticles,
            enabled: process.env.SCHEDULE_FILTER_ENABLED !== 'false',
            task: null,
            handler: this.filterArticlesHandler.bind(this)
        });
        
        // 3. 글 자동 생성
        this.tasks.set('generateContent', {
            name: '글 자동 생성',
            cron: this.schedules.generateContent,
            enabled: process.env.SCHEDULE_GENERATE_ENABLED !== 'false',
            task: null,
            handler: this.generateContentHandler.bind(this)
        });
        
        // 4. 브런치 스타일 재분석
        this.tasks.set('reanalyzeStyle', {
            name: '브런치 스타일 재분석',
            cron: this.schedules.reanalyzeStyle,
            enabled: process.env.SCHEDULE_REANALYZE_ENABLED !== 'false',
            task: null,
            handler: this.reanalyzeStyleHandler.bind(this)
        });
        
        // 5. 통계 리포트 생성
        this.tasks.set('generateReport', {
            name: '통계 리포트 생성',
            cron: this.schedules.generateReport,
            enabled: process.env.SCHEDULE_REPORT_ENABLED !== 'false',
            task: null,
            handler: this.generateReportHandler.bind(this)
        });
    }
    
    start() {
        if (this.isRunning) {
            console.log('⚠️ 스케줄러가 이미 실행 중입니다.');
            return;
        }
        
        this.tasks.forEach((taskInfo, taskId) => {
            if (taskInfo.enabled) {
                taskInfo.task = cron.schedule(taskInfo.cron, async () => {
                    await this.executeTask(taskId, taskInfo);
                }, {
                    scheduled: false,
                    timezone: 'Asia/Seoul'
                });
                
                taskInfo.task.start();
                console.log(`✅ ${taskInfo.name} 스케줄 등록: ${taskInfo.cron}`);
            } else {
                console.log(`⏸️ ${taskInfo.name} 스케줄 비활성화`);
            }
        });
        
        this.isRunning = true;
        this.log('스케줄러 시작됨', 'system', 'info');
        console.log('🚀 HR 콘텐츠 자동화 스케줄러가 시작되었습니다.');
        
        // 일일 요약 리포트 스케줄 (매일 오후 11:59)
        if (!this.config.isDevelopment) {
            cron.schedule('59 23 * * *', () => {
                this.generateDailySummary();
            }, { timezone: 'Asia/Seoul' });
        }
    }
    
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ 스케줄러가 실행되고 있지 않습니다.');
            return;
        }
        
        this.tasks.forEach((taskInfo) => {
            if (taskInfo.task) {
                taskInfo.task.stop();
            }
        });
        
        this.isRunning = false;
        this.log('스케줄러 중지됨', 'system', 'info');
        console.log('⏹️ 스케줄러가 중지되었습니다.');
    }
    
    async executeTask(taskId, taskInfo) {
        const startTime = Date.now();
        let success = false;
        let errorMessage = null;
        
        try {
            await this.log(`${taskInfo.name} 작업 시작`, taskId, 'info');
            
            // 작업 실행
            await taskInfo.handler();
            
            success = true;
            await this.log(`${taskInfo.name} 작업 완료`, taskId, 'success');
            
        } catch (error) {
            success = false;
            errorMessage = error.message;
            await this.log(`${taskInfo.name} 작업 실패: ${error.message}`, taskId, 'error');
            
            // 상세 에러 로깅
            if (error.stack) {
                await this.log(`스택 트레이스:\n${error.stack}`, taskId, 'error');
            }
        }
        
        // 실행 시간 계산
        const executionTime = Date.now() - startTime;
        
        // 통계 업데이트
        await this.updateStats(taskId, success, executionTime, errorMessage);
        
        // 알림
        if (this.config.notifications) {
            this.sendNotification(taskId, taskInfo.name, success, executionTime, errorMessage);
        }
        
        return success;
    }
    
    // 작업 핸들러들 (JobManager 사용)
    async scrapeArticlesHandler() {
        const { getJobManager, JobTypes } = require('./jobs/jobManager');
        const jobManager = getJobManager();
        
        const job = jobManager.createJob(JobTypes.ARTICLE_COLLECTION);
        await jobManager.enqueueJob(job);
        
        // Job 완료 대기
        return new Promise((resolve, reject) => {
            const checkJob = setInterval(() => {
                const currentJob = jobManager.getJob(job.id);
                if (currentJob.status === 'completed') {
                    clearInterval(checkJob);
                    resolve(currentJob.result);
                } else if (currentJob.status === 'failed') {
                    clearInterval(checkJob);
                    reject(new Error(currentJob.error));
                }
            }, 1000);
            
            // 타임아웃 설정 (5분)
            setTimeout(() => {
                clearInterval(checkJob);
                reject(new Error('Job timeout'));
            }, 5 * 60 * 1000);
        });
    }
    
    async filterArticlesHandler() {
        const { getJobManager, JobTypes } = require('./jobs/jobManager');
        const jobManager = getJobManager();
        
        const job = jobManager.createJob(JobTypes.CONTENT_ANALYSIS, {
            qualityThreshold: 60,
            maxArticles: 10
        });
        await jobManager.enqueueJob(job);
        
        // Job 완료 대기
        return new Promise((resolve, reject) => {
            const checkJob = setInterval(() => {
                const currentJob = jobManager.getJob(job.id);
                if (currentJob.status === 'completed') {
                    clearInterval(checkJob);
                    resolve(currentJob.result);
                } else if (currentJob.status === 'failed') {
                    clearInterval(checkJob);
                    reject(new Error(currentJob.error));
                }
            }, 1000);
            
            setTimeout(() => {
                clearInterval(checkJob);
                reject(new Error('Job timeout'));
            }, 5 * 60 * 1000);
        });
    }
    
    async generateContentHandler() {
        const { getJobManager, JobTypes } = require('./jobs/jobManager');
        const jobManager = getJobManager();
        
        const job = jobManager.createJob(JobTypes.ARTICLE_GENERATION, {
            maxArticles: 3
        });
        await jobManager.enqueueJob(job);
        
        // Job 완료 대기
        return new Promise((resolve, reject) => {
            const checkJob = setInterval(() => {
                const currentJob = jobManager.getJob(job.id);
                if (currentJob.status === 'completed') {
                    clearInterval(checkJob);
                    resolve(currentJob.result);
                } else if (currentJob.status === 'failed') {
                    clearInterval(checkJob);
                    reject(new Error(currentJob.error));
                }
            }, 1000);
            
            setTimeout(() => {
                clearInterval(checkJob);
                reject(new Error('Job timeout'));
            }, 10 * 60 * 1000); // 10분 타임아웃
        });
    }
    
    async reanalyzeStyleHandler() {
        const { getJobManager, JobTypes } = require('./jobs/jobManager');
        const jobManager = getJobManager();
        
        const job = jobManager.createJob(JobTypes.STYLE_UPDATE, {
            targetUrls: [
                'https://brunch.co.kr/@hr-insight/latest',
                'https://brunch.co.kr/@career-lab/popular',
                'https://brunch.co.kr/@workplace/trending'
            ]
        });
        await jobManager.enqueueJob(job);
        
        // Job 완료 대기
        return new Promise((resolve, reject) => {
            const checkJob = setInterval(() => {
                const currentJob = jobManager.getJob(job.id);
                if (currentJob.status === 'completed') {
                    clearInterval(checkJob);
                    resolve(currentJob.result);
                } else if (currentJob.status === 'failed') {
                    clearInterval(checkJob);
                    reject(new Error(currentJob.error));
                }
            }, 1000);
            
            setTimeout(() => {
                clearInterval(checkJob);
                reject(new Error('Job timeout'));
            }, 10 * 60 * 1000);
        });
    }
    
    async generateReportHandler() {
        const { getJobManager, JobTypes } = require('./jobs/jobManager');
        const jobManager = getJobManager();
        
        const reportType = new Date().getDate() === 1 ? 'monthly' : 'weekly';
        const job = jobManager.createJob(JobTypes.REPORT_GENERATION, {
            reportType,
            generateHTML: true
        });
        await jobManager.enqueueJob(job);
        
        // Job 완료 대기
        return new Promise((resolve, reject) => {
            const checkJob = setInterval(() => {
                const currentJob = jobManager.getJob(job.id);
                if (currentJob.status === 'completed') {
                    clearInterval(checkJob);
                    resolve(currentJob.result);
                } else if (currentJob.status === 'failed') {
                    clearInterval(checkJob);
                    reject(new Error(currentJob.error));
                }
            }, 1000);
            
            setTimeout(() => {
                clearInterval(checkJob);
                reject(new Error('Job timeout'));
            }, 5 * 60 * 1000);
        });
    }
    
    // 수동 실행 함수들
    async runTask(taskId) {
        const taskInfo = this.tasks.get(taskId);
        if (!taskInfo) {
            throw new Error(`존재하지 않는 작업: ${taskId}`);
        }
        
        await this.log(`수동 실행: ${taskInfo.name}`, taskId, 'info');
        return await this.executeTask(taskId, taskInfo);
    }
    
    // 통계 및 로깅
    async loadStats() {
        try {
            if (await fs.pathExists(this.statsFile)) {
                this.stats = await fs.readJson(this.statsFile);
            }
        } catch (error) {
            await this.log(`통계 로드 실패: ${error.message}`, 'system', 'error');
        }
    }
    
    async saveStats() {
        try {
            await fs.writeJson(this.statsFile, this.stats, { spaces: 2 });
        } catch (error) {
            console.error('통계 저장 실패:', error.message);
        }
    }
    
    async updateStats(taskId, success, executionTime, errorMessage) {
        this.stats.totalExecutions++;
        this.stats.lastExecution = new Date().toISOString();
        
        if (success) {
            this.stats.successCount++;
        } else {
            this.stats.failureCount++;
        }
        
        // 평균 실행 시간 업데이트
        this.stats.averageExecutionTime = 
            (this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime) / 
            this.stats.totalExecutions;
        
        // 작업별 통계
        if (!this.stats.taskStats[taskId]) {
            this.stats.taskStats[taskId] = {
                executions: 0,
                successes: 0,
                failures: 0,
                averageTime: 0,
                lastExecution: null,
                lastError: null
            };
        }
        
        const taskStats = this.stats.taskStats[taskId];
        taskStats.executions++;
        taskStats.lastExecution = new Date().toISOString();
        
        if (success) {
            taskStats.successes++;
        } else {
            taskStats.failures++;
            taskStats.lastError = errorMessage;
        }
        
        taskStats.averageTime = 
            (taskStats.averageTime * (taskStats.executions - 1) + executionTime) / 
            taskStats.executions;
        
        await this.saveStats();
    }
    
    async log(message, category = 'system', level = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}\n`;
        
        // 콘솔 출력
        const colors = {
            info: '\x1b[36m',    // 청록
            success: '\x1b[32m', // 녹색
            warn: '\x1b[33m',    // 노랑
            error: '\x1b[31m',   // 빨강
            system: '\x1b[35m'   // 마젠타
        };
        const resetColor = '\x1b[0m';
        
        console.log(`${colors[level] || colors.info}${logEntry.trim()}${resetColor}`);
        
        // 파일 로깅
        try {
            await fs.appendFile(this.logFile, logEntry);
        } catch (error) {
            console.error('로그 파일 쓰기 실패:', error.message);
        }
    }
    
    sendNotification(taskId, taskName, success, executionTime, errorMessage) {
        const status = success ? '✅ 성공' : '❌ 실패';
        const duration = `${(executionTime / 1000).toFixed(2)}초`;
        
        if (success) {
            console.log(`🔔 [알림] ${taskName} ${status} (${duration})`);
        } else {
            console.log(`🚨 [알림] ${taskName} ${status} (${duration})`);
            console.log(`📝 오류: ${errorMessage}`);
        }
    }
    
    async generateDailySummary() {
        const today = new Date().toDateString();
        const todayStats = this.getTodayStats();
        
        const summary = `
📊 일일 요약 리포트 (${today})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 총 실행: ${todayStats.total}건
• 성공: ${todayStats.success}건 (${((todayStats.success/todayStats.total)*100).toFixed(1)}%)
• 실패: ${todayStats.failure}건
• 평균 실행시간: ${(todayStats.averageTime/1000).toFixed(2)}초

작업별 현황:
${this.getTaskSummary()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `.trim();
        
        await this.log(summary, 'daily-summary', 'info');
    }
    
    // 헬퍼 함수들
    getCurrentPeriod() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    
    getTodayStats() {
        const today = new Date().toDateString();
        // 실제 구현에서는 오늘의 통계만 필터링
        return {
            total: this.stats.totalExecutions,
            success: this.stats.successCount,
            failure: this.stats.failureCount,
            averageTime: this.stats.averageExecutionTime
        };
    }
    
    getTaskSummary() {
        return Object.entries(this.stats.taskStats)
            .map(([taskId, stats]) => {
                const taskInfo = this.tasks.get(taskId);
                const successRate = stats.executions > 0 ? 
                    ((stats.successes / stats.executions) * 100).toFixed(1) : '0.0';
                return `  • ${taskInfo?.name || taskId}: ${stats.executions}회 실행, ${successRate}% 성공`;
            })
            .join('\n');
    }
    
    getTaskPerformance() {
        const performance = {};
        
        for (const [taskId, stats] of Object.entries(this.stats.taskStats)) {
            performance[taskId] = {
                successRate: stats.executions > 0 ? (stats.successes / stats.executions) : 0,
                averageTime: stats.averageTime,
                reliability: stats.failures < stats.successes ? 'good' : 'needs_attention'
            };
        }
        
        return performance;
    }
    
    async getSystemHealth() {
        try {
            const used = process.memoryUsage();
            return {
                memoryUsage: {
                    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
                    external: Math.round(used.external / 1024 / 1024)
                },
                uptime: Math.round(process.uptime()),
                nodeVersion: process.version,
                schedulerStatus: this.isRunning ? 'running' : 'stopped'
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    // 외부 제어 API
    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            stats: this.stats,
            tasks: Array.from(this.tasks.entries()).map(([id, info]) => ({
                id,
                name: info.name,
                cron: info.cron,
                enabled: info.enabled,
                running: info.task?.running || false
            }))
        };
    }
    
    async enableTask(taskId) {
        const taskInfo = this.tasks.get(taskId);
        if (!taskInfo) throw new Error(`존재하지 않는 작업: ${taskId}`);
        
        taskInfo.enabled = true;
        
        if (this.isRunning && !taskInfo.task?.running) {
            taskInfo.task = cron.schedule(taskInfo.cron, async () => {
                await this.executeTask(taskId, taskInfo);
            }, { scheduled: true, timezone: 'Asia/Seoul' });
        }
        
        await this.log(`작업 활성화: ${taskInfo.name}`, taskId, 'info');
    }
    
    async disableTask(taskId) {
        const taskInfo = this.tasks.get(taskId);
        if (!taskInfo) throw new Error(`존재하지 않는 작업: ${taskId}`);
        
        taskInfo.enabled = false;
        
        if (taskInfo.task) {
            taskInfo.task.stop();
        }
        
        await this.log(`작업 비활성화: ${taskInfo.name}`, taskId, 'info');
    }
}

// 싱글톤 인스턴스
let schedulerInstance = null;

function getScheduler() {
    if (!schedulerInstance) {
        schedulerInstance = new SchedulerManager();
    }
    return schedulerInstance;
}

// 직접 실행 시
if (require.main === module) {
    const scheduler = getScheduler();
    
    // 프로세스 종료 시 정리
    process.on('SIGINT', () => {
        console.log('\n🛑 스케줄러 종료 중...');
        scheduler.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        scheduler.stop();
        process.exit(0);
    });
}

module.exports = { SchedulerManager, getScheduler };