const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');

// Job 타입 정의
const JobTypes = {
    ARTICLE_COLLECTION: 'ArticleCollectionJob',
    CONTENT_ANALYSIS: 'ContentAnalysisJob',
    ARTICLE_GENERATION: 'ArticleGenerationJob',
    STYLE_UPDATE: 'StyleUpdateJob',
    REPORT_GENERATION: 'ReportGenerationJob',
    BRUNCH_PUBLISH: 'BrunchPublishJob'
};

// Job 상태 정의
const JobStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying'
};

// 기본 Job 클래스
class BaseJob {
    constructor(id, type, config = {}) {
        this.id = id;
        this.type = type;
        this.status = JobStatus.PENDING;
        this.config = config;
        this.createdAt = new Date().toISOString();
        this.startedAt = null;
        this.completedAt = null;
        this.executionTime = null;
        this.result = null;
        this.error = null;
        this.retryCount = 0;
        this.maxRetries = config.maxRetries || 3;
        this.dependencies = config.dependencies || [];
    }
    
    async execute() {
        throw new Error('execute() must be implemented by subclass');
    }
    
    async validateResult() {
        return true; // Override in subclasses
    }
    
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            config: this.config,
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            executionTime: this.executionTime,
            result: this.result,
            error: this.error,
            retryCount: this.retryCount
        };
    }
}

// 1. 기사 수집 Job
class ArticleCollectionJob extends BaseJob {
    constructor(id, config = {}) {
        super(id, JobTypes.ARTICLE_COLLECTION, config);
        this.failedSites = [];
    }
    
    async execute() {
        const HRContentScraper = require('../scrapers/hrContentScraper');
        const scraper = new HRContentScraper();
        
        const results = {
            totalArticles: 0,
            successfulSites: [],
            failedSites: [],
            articles: []
        };
        
        try {
            // 개별 사이트 스크래핑 및 실패 추적
            const sites = ['googleNews', 'naverNews', 'hrdKorea', 'jobKoreaHR'];
            
            for (const site of sites) {
                try {
                    console.log(`📰 ${site} 수집 중...`);
                    const siteArticles = await this.scrapeSite(scraper, site);
                    
                    if (siteArticles && siteArticles.length > 0) {
                        results.articles.push(...siteArticles);
                        results.successfulSites.push(site);
                        results.totalArticles += siteArticles.length;
                    }
                } catch (error) {
                    console.error(`❌ ${site} 수집 실패:`, error.message);
                    results.failedSites.push({ site, error: error.message });
                    this.failedSites.push(site);
                }
            }
            
            // 실패한 사이트 재시도
            if (this.failedSites.length > 0 && this.retryCount < this.maxRetries) {
                console.log(`🔄 실패한 사이트 재시도 (${this.retryCount + 1}/${this.maxRetries})`);
                await this.retryFailedSites(scraper, results);
            }
            
            // 중복 제거
            results.articles = this.removeDuplicates(results.articles);
            results.totalArticles = results.articles.length;
            
            this.result = results;
            return results;
            
        } catch (error) {
            this.error = error.message;
            throw error;
        }
    }
    
    async scrapeSite(scraper, site) {
        switch (site) {
            case 'googleNews':
                return await scraper.scrapeGoogleNews();
            case 'naverNews':
                return await scraper.scrapeNaverNews();
            case 'hrdKorea':
                return await scraper.scrapeHRDKorea();
            case 'jobKoreaHR':
                return await scraper.scrapeJobKoreaHR();
            default:
                throw new Error(`Unknown site: ${site}`);
        }
    }
    
    async retryFailedSites(scraper, results) {
        const retryResults = [];
        
        for (const site of this.failedSites) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
                const siteArticles = await this.scrapeSite(scraper, site);
                
                if (siteArticles && siteArticles.length > 0) {
                    retryResults.push(...siteArticles);
                    results.successfulSites.push(`${site} (재시도)`);
                    
                    // 실패 목록에서 제거
                    const failedIndex = results.failedSites.findIndex(f => f.site === site);
                    if (failedIndex >= 0) {
                        results.failedSites.splice(failedIndex, 1);
                    }
                }
            } catch (error) {
                console.error(`❌ ${site} 재시도 실패:`, error.message);
            }
        }
        
        if (retryResults.length > 0) {
            results.articles.push(...retryResults);
            results.totalArticles += retryResults.length;
        }
    }
    
    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = `${article.title}-${article.url}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    async validateResult() {
        return this.result && 
               this.result.totalArticles > 0 && 
               this.result.successfulSites.length > 0;
    }
}

// 2. 콘텐츠 분석 Job
class ContentAnalysisJob extends BaseJob {
    constructor(id, config = {}) {
        super(id, JobTypes.CONTENT_ANALYSIS, config);
        this.dependencies = ['ArticleCollectionJob'];
    }
    
    async execute() {
        const ContentFilter = require('../analyzers/contentFilter');
        const filter = new ContentFilter();
        
        try {
            // 최신 수집된 기사 로드
            const articlesPath = path.join(__dirname, '../../data/articles/hr-articles-latest.json');
            if (!await fs.pathExists(articlesPath)) {
                throw new Error('수집된 기사가 없습니다. 먼저 기사 수집을 실행하세요.');
            }
            
            const articlesData = await fs.readJson(articlesPath);
            const articles = articlesData.articles || [];
            
            console.log(`📊 ${articles.length}개 기사 분석 시작...`);
            
            // 품질 점수 계산 및 필터링
            const analyzedArticles = [];
            
            for (const article of articles) {
                const scores = filter.calculateScores(article);
                const finalScore = filter.calculateFinalScore(
                    scores.relevance,
                    scores.freshness,
                    scores.quality,
                    scores.duplication
                );
                
                analyzedArticles.push({
                    ...article,
                    scores,
                    finalScore
                });
            }
            
            // 점수 기준 정렬
            analyzedArticles.sort((a, b) => b.finalScore - a.finalScore);
            
            // 상위 기사 선별
            const threshold = this.config.qualityThreshold || 60;
            const recommendedArticles = analyzedArticles.filter(a => a.finalScore >= threshold);
            const topArticles = recommendedArticles.slice(0, this.config.maxArticles || 10);
            
            const results = {
                totalAnalyzed: articles.length,
                recommendedCount: recommendedArticles.length,
                selectedCount: topArticles.length,
                averageScore: analyzedArticles.reduce((sum, a) => sum + a.finalScore, 0) / analyzedArticles.length,
                topArticles,
                scoreDistribution: this.getScoreDistribution(analyzedArticles)
            };
            
            // 분석 결과 저장
            const outputPath = path.join(__dirname, '../../data/articles/analyzed-articles-latest.json');
            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeJson(outputPath, {
                metadata: {
                    analyzedAt: new Date().toISOString(),
                    ...results
                },
                articles: topArticles
            }, { spaces: 2 });
            
            this.result = results;
            return results;
            
        } catch (error) {
            this.error = error.message;
            throw error;
        }
    }
    
    getScoreDistribution(articles) {
        const distribution = {
            '90-100': 0,
            '80-89': 0,
            '70-79': 0,
            '60-69': 0,
            '50-59': 0,
            '0-49': 0
        };
        
        articles.forEach(article => {
            const score = Math.floor(article.finalScore);
            if (score >= 90) distribution['90-100']++;
            else if (score >= 80) distribution['80-89']++;
            else if (score >= 70) distribution['70-79']++;
            else if (score >= 60) distribution['60-69']++;
            else if (score >= 50) distribution['50-59']++;
            else distribution['0-49']++;
        });
        
        return distribution;
    }
    
    async validateResult() {
        return this.result && 
               this.result.totalAnalyzed > 0 && 
               this.result.selectedCount > 0;
    }
}

// 3. 글 생성 Job
class ArticleGenerationJob extends BaseJob {
    constructor(id, config = {}) {
        super(id, JobTypes.ARTICLE_GENERATION, config);
        this.dependencies = ['ContentAnalysisJob'];
    }
    
    async execute() {
        const ArticleWriter = require('../writers/articleWriter');
        const QualityChecker = require('../analyzers/qualityChecker');
        
        const writer = new ArticleWriter();
        const checker = new QualityChecker();
        
        try {
            // 분석된 기사 로드
            const analyzedPath = path.join(__dirname, '../../data/articles/analyzed-articles-latest.json');
            if (!await fs.pathExists(analyzedPath)) {
                throw new Error('분석된 기사가 없습니다. 먼저 기사 분석을 실행하세요.');
            }
            
            const analyzedData = await fs.readJson(analyzedPath);
            const topArticles = analyzedData.articles || [];
            
            const maxArticles = this.config.maxArticles || 3;
            const articlesToGenerate = topArticles.slice(0, maxArticles);
            
            console.log(`✍️ ${articlesToGenerate.length}개 글 생성 시작...`);
            
            const generatedArticles = [];
            const qualityReports = [];
            
            for (const article of articlesToGenerate) {
                try {
                    // 글 생성
                    console.log(`📝 생성 중: ${article.title}`);
                    const generated = await writer.generateArticle(article);
                    
                    // 품질 검증
                    const qualityReport = await checker.generateQualityReport(generated);
                    
                    generatedArticles.push({
                        ...generated,
                        qualityScore: qualityReport.scores.total,
                        qualityStatus: qualityReport.status
                    });
                    
                    qualityReports.push(qualityReport);
                    
                    // API 제한 고려하여 딜레이
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (error) {
                    console.error(`❌ 글 생성 실패 (${article.title}):`, error.message);
                }
            }
            
            // 최고 점수 글 선별
            generatedArticles.sort((a, b) => b.qualityScore - a.qualityScore);
            const bestArticle = generatedArticles[0];
            
            const results = {
                totalRequested: articlesToGenerate.length,
                totalGenerated: generatedArticles.length,
                averageQualityScore: generatedArticles.reduce((sum, a) => sum + a.qualityScore, 0) / generatedArticles.length,
                bestArticle: bestArticle ? {
                    title: bestArticle.title,
                    score: bestArticle.qualityScore
                } : null,
                passedCount: generatedArticles.filter(a => a.qualityStatus === 'PASSED').length,
                articles: generatedArticles
            };
            
            // 생성된 글 저장
            const outputPath = path.join(__dirname, '../../data/drafts/generated-articles-latest.json');
            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeJson(outputPath, {
                metadata: {
                    generatedAt: new Date().toISOString(),
                    ...results
                },
                articles: generatedArticles,
                qualityReports
            }, { spaces: 2 });
            
            this.result = results;
            return results;
            
        } catch (error) {
            this.error = error.message;
            throw error;
        }
    }
    
    async validateResult() {
        return this.result && 
               this.result.totalGenerated > 0 && 
               this.result.averageQualityScore > 0;
    }
}

// 4. 스타일 업데이트 Job
class StyleUpdateJob extends BaseJob {
    constructor(id, config = {}) {
        super(id, JobTypes.STYLE_UPDATE, config);
    }
    
    async execute() {
        const BrunchAnalyzer = require('../brunchAnalyzer-simple');
        const analyzer = new BrunchAnalyzer();
        
        try {
            // 분석할 브런치 URL 목록
            const targetUrls = this.config.targetUrls || [
                'https://brunch.co.kr/@hr-insight/latest',
                'https://brunch.co.kr/@career-lab/popular',
                'https://brunch.co.kr/@workplace/trending'
            ];
            
            console.log(`🎨 브런치 스타일 분석 시작 (${targetUrls.length}개 URL)...`);
            
            const analysisResults = [];
            const styleChanges = [];
            
            // 이전 스타일 데이터 로드
            const previousStylePath = path.join(__dirname, '../../data/style/brunch-style-latest.json');
            let previousStyle = null;
            if (await fs.pathExists(previousStylePath)) {
                previousStyle = await fs.readJson(previousStylePath);
            }
            
            for (const url of targetUrls) {
                try {
                    console.log(`📖 분석 중: ${url}`);
                    const analysis = await analyzer.analyzeBrunchPost(url);
                    analysisResults.push(analysis);
                    
                    // API 제한 고려하여 딜레이
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                } catch (error) {
                    console.error(`❌ 분석 실패 (${url}):`, error.message);
                }
            }
            
            // 통합 스타일 패턴 추출
            const mergedPatterns = this.mergeStylePatterns(analysisResults);
            
            // 변화 감지
            if (previousStyle) {
                styleChanges.push(...this.detectStyleChanges(previousStyle, mergedPatterns));
            }
            
            // 템플릿 업데이트
            const updatedTemplates = this.updateTemplates(mergedPatterns);
            
            const results = {
                analyzedUrls: targetUrls.length,
                successfulAnalysis: analysisResults.length,
                styleChanges: styleChanges.length,
                changes: styleChanges,
                updatedTemplates: updatedTemplates.length,
                patterns: mergedPatterns
            };
            
            // 스타일 데이터 저장
            const outputPath = path.join(__dirname, '../../data/style/brunch-style-latest.json');
            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeJson(outputPath, {
                metadata: {
                    updatedAt: new Date().toISOString(),
                    ...results
                },
                patterns: mergedPatterns,
                templates: updatedTemplates,
                rawAnalysis: analysisResults
            }, { spaces: 2 });
            
            // 변화가 있으면 알림
            if (styleChanges.length > 0) {
                console.log(`🔔 ${styleChanges.length}개의 스타일 변화가 감지되었습니다.`);
                styleChanges.forEach(change => {
                    console.log(`  - ${change.type}: ${change.description}`);
                });
            }
            
            this.result = results;
            return results;
            
        } catch (error) {
            this.error = error.message;
            throw error;
        }
    }
    
    mergeStylePatterns(analysisResults) {
        const merged = {
            titlePatterns: [],
            expressions: [],
            hashtags: new Set(),
            structurePatterns: [],
            writingTechniques: []
        };
        
        analysisResults.forEach(analysis => {
            if (analysis.patterns) {
                merged.titlePatterns.push(...(analysis.patterns.titlePatterns || []));
                merged.expressions.push(...(analysis.patterns.expressions || []));
                analysis.patterns.hashtags?.forEach(tag => merged.hashtags.add(tag));
                merged.structurePatterns.push(...(analysis.patterns.structurePatterns || []));
                merged.writingTechniques.push(...(analysis.patterns.writingTechniques || []));
            }
        });
        
        // 중복 제거 및 빈도 계산
        return {
            titlePatterns: this.getTopPatterns(merged.titlePatterns, 10),
            expressions: this.getTopPatterns(merged.expressions, 20),
            hashtags: Array.from(merged.hashtags).slice(0, 30),
            structurePatterns: this.getTopPatterns(merged.structurePatterns, 5),
            writingTechniques: this.getTopPatterns(merged.writingTechniques, 10)
        };
    }
    
    getTopPatterns(patterns, limit) {
        const frequency = {};
        patterns.forEach(pattern => {
            const key = typeof pattern === 'string' ? pattern : JSON.stringify(pattern);
            frequency[key] = (frequency[key] || 0) + 1;
        });
        
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([pattern, count]) => ({
                pattern: pattern.startsWith('{') ? JSON.parse(pattern) : pattern,
                frequency: count
            }));
    }
    
    detectStyleChanges(previous, current) {
        const changes = [];
        
        // 제목 패턴 변화
        const prevTitles = new Set(previous.patterns?.titlePatterns?.map(p => p.pattern) || []);
        const currTitles = new Set(current.titlePatterns.map(p => p.pattern));
        
        currTitles.forEach(title => {
            if (!prevTitles.has(title)) {
                changes.push({
                    type: 'title_pattern',
                    description: `새로운 제목 패턴: ${title}`,
                    pattern: title
                });
            }
        });
        
        // 해시태그 트렌드 변화
        const prevTags = new Set(previous.patterns?.hashtags || []);
        const currTags = new Set(current.hashtags);
        
        currTags.forEach(tag => {
            if (!prevTags.has(tag)) {
                changes.push({
                    type: 'hashtag_trend',
                    description: `새로운 트렌드 해시태그: #${tag}`,
                    tag
                });
            }
        });
        
        return changes;
    }
    
    updateTemplates(patterns) {
        return [
            {
                name: 'trending_title_template',
                template: patterns.titlePatterns[0]?.pattern || '${topic}에 대한 새로운 관점',
                usage: '최신 트렌드를 반영한 제목'
            },
            {
                name: 'popular_expression_template',
                template: patterns.expressions.slice(0, 5).map(e => e.pattern),
                usage: '인기 표현 및 어휘'
            },
            {
                name: 'hashtag_set_template',
                template: patterns.hashtags.slice(0, 10),
                usage: '추천 해시태그 세트'
            }
        ];
    }
    
    async validateResult() {
        return this.result && 
               this.result.successfulAnalysis > 0 && 
               this.result.patterns !== null;
    }
}

// 5. 리포트 생성 Job
class ReportGenerationJob extends BaseJob {
    constructor(id, config = {}) {
        super(id, JobTypes.REPORT_GENERATION, config);
    }
    
    async execute() {
        try {
            const reportType = this.config.reportType || 'weekly'; // weekly, monthly
            const period = this.getPeriod(reportType);
            
            console.log(`📊 ${reportType} 리포트 생성 시작 (${period.start} ~ ${period.end})...`);
            
            // 데이터 수집
            const stats = await this.collectStatistics(period);
            const performance = await this.analyzePerformance(stats);
            const trends = await this.analyzeTrends(stats);
            
            const report = {
                type: reportType,
                period,
                summary: {
                    totalArticlesCollected: stats.articleCollection.total,
                    totalArticlesGenerated: stats.articleGeneration.total,
                    averageQualityScore: stats.quality.average,
                    successRate: stats.overall.successRate,
                    topPerformingContent: stats.topContent
                },
                performance,
                trends,
                recommendations: this.generateRecommendations(performance, trends)
            };
            
            // 리포트 저장
            const outputPath = path.join(
                __dirname, 
                `../../data/reports/${reportType}-report-${period.start}.json`
            );
            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeJson(outputPath, {
                metadata: {
                    generatedAt: new Date().toISOString(),
                    reportType,
                    period
                },
                report
            }, { spaces: 2 });
            
            // HTML 리포트 생성 (선택적)
            if (this.config.generateHTML) {
                await this.generateHTMLReport(report, outputPath.replace('.json', '.html'));
            }
            
            this.result = report;
            return report;
            
        } catch (error) {
            this.error = error.message;
            throw error;
        }
    }
    
    getPeriod(reportType) {
        const now = new Date();
        let start, end;
        
        if (reportType === 'weekly') {
            end = new Date(now);
            start = new Date(now.setDate(now.getDate() - 7));
        } else if (reportType === 'monthly') {
            end = new Date(now);
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }
    
    async collectStatistics(period) {
        const stats = {
            articleCollection: { total: 0, bySource: {} },
            articleGeneration: { total: 0, passed: 0, failed: 0 },
            quality: { scores: [], average: 0 },
            overall: { successRate: 0, totalJobs: 0, successfulJobs: 0 },
            topContent: []
        };
        
        // 데이터 디렉토리 스캔
        const dataDir = path.join(__dirname, '../../data');
        
        // 기사 수집 통계
        const articlesDir = path.join(dataDir, 'articles');
        if (await fs.pathExists(articlesDir)) {
            const files = await fs.readdir(articlesDir);
            for (const file of files) {
                if (file.endsWith('.json') && !file.includes('latest')) {
                    const data = await fs.readJson(path.join(articlesDir, file));
                    if (this.isInPeriod(data.metadata?.scrapedAt, period)) {
                        stats.articleCollection.total += data.metadata?.totalArticles || 0;
                    }
                }
            }
        }
        
        // 글 생성 통계
        const draftsDir = path.join(dataDir, 'drafts');
        if (await fs.pathExists(draftsDir)) {
            const files = await fs.readdir(draftsDir);
            for (const file of files) {
                if (file.endsWith('.json') && !file.includes('latest')) {
                    const data = await fs.readJson(path.join(draftsDir, file));
                    if (this.isInPeriod(data.metadata?.generatedAt, period)) {
                        stats.articleGeneration.total += data.metadata?.totalGenerated || 0;
                        stats.articleGeneration.passed += data.metadata?.passedCount || 0;
                        
                        // 품질 점수 수집
                        if (data.articles) {
                            data.articles.forEach(article => {
                                if (article.qualityScore) {
                                    stats.quality.scores.push(article.qualityScore);
                                }
                            });
                            
                            // 상위 콘텐츠
                            const topArticles = data.articles
                                .filter(a => a.qualityScore >= 80)
                                .sort((a, b) => b.qualityScore - a.qualityScore)
                                .slice(0, 3);
                            stats.topContent.push(...topArticles);
                        }
                    }
                }
            }
        }
        
        // 평균 계산
        if (stats.quality.scores.length > 0) {
            stats.quality.average = stats.quality.scores.reduce((a, b) => a + b, 0) / stats.quality.scores.length;
        }
        
        // 성공률 계산
        stats.overall.successfulJobs = stats.articleGeneration.passed;
        stats.overall.totalJobs = stats.articleGeneration.total;
        stats.overall.successRate = stats.overall.totalJobs > 0 
            ? (stats.overall.successfulJobs / stats.overall.totalJobs) * 100 
            : 0;
        
        // 상위 콘텐츠 정렬
        stats.topContent.sort((a, b) => b.qualityScore - a.qualityScore);
        stats.topContent = stats.topContent.slice(0, 5);
        
        return stats;
    }
    
    async analyzePerformance(stats) {
        return {
            collectionEfficiency: {
                averageArticlesPerDay: stats.articleCollection.total / 7,
                trend: 'stable' // 실제로는 이전 기간과 비교
            },
            generationQuality: {
                passRate: (stats.articleGeneration.passed / stats.articleGeneration.total) * 100,
                averageScore: stats.quality.average,
                trend: stats.quality.average > 75 ? 'improving' : 'declining'
            },
            overallHealth: {
                score: this.calculateHealthScore(stats),
                status: this.getHealthStatus(stats)
            }
        };
    }
    
    async analyzeTrends(stats) {
        const trends = {
            contentTopics: [],
            popularHashtags: [],
            qualityImprovement: 'stable',
            recommendedActions: []
        };
        
        // 실제 구현에서는 더 상세한 트렌드 분석
        if (stats.quality.average < 70) {
            trends.recommendedActions.push('품질 개선을 위한 프롬프트 조정 필요');
        }
        
        if (stats.articleCollection.total < 50) {
            trends.recommendedActions.push('더 많은 소스에서 기사 수집 필요');
        }
        
        return trends;
    }
    
    generateRecommendations(performance, trends) {
        const recommendations = [];
        
        if (performance.generationQuality.passRate < 70) {
            recommendations.push({
                priority: 'high',
                action: '콘텐츠 생성 프롬프트 최적화',
                reason: `현재 통과율이 ${performance.generationQuality.passRate.toFixed(1)}%로 낮음`
            });
        }
        
        if (performance.collectionEfficiency.averageArticlesPerDay < 10) {
            recommendations.push({
                priority: 'medium',
                action: '기사 수집 소스 확대',
                reason: '일일 평균 수집 기사 수가 목표치 미달'
            });
        }
        
        trends.recommendedActions.forEach(action => {
            recommendations.push({
                priority: 'low',
                action,
                reason: '트렌드 분석 결과'
            });
        });
        
        return recommendations;
    }
    
    calculateHealthScore(stats) {
        let score = 0;
        
        // 수집 효율성 (30%)
        score += Math.min((stats.articleCollection.total / 100) * 30, 30);
        
        // 생성 품질 (40%)
        score += (stats.quality.average / 100) * 40;
        
        // 성공률 (30%)
        score += (stats.overall.successRate / 100) * 30;
        
        return Math.round(score);
    }
    
    getHealthStatus(stats) {
        const score = this.calculateHealthScore(stats);
        
        if (score >= 80) return 'excellent';
        if (score >= 70) return 'good';
        if (score >= 60) return 'fair';
        if (score >= 50) return 'poor';
        return 'critical';
    }
    
    isInPeriod(dateString, period) {
        if (!dateString) return false;
        const date = new Date(dateString);
        const start = new Date(period.start);
        const end = new Date(period.end);
        return date >= start && date <= end;
    }
    
    async generateHTMLReport(report, outputPath) {
        const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${report.type} 리포트 - ${report.period.start}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1, h2 { color: #333; }
        .metric { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .good { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
    </style>
</head>
<body>
    <h1>${report.type === 'weekly' ? '주간' : '월간'} 리포트</h1>
    <p>기간: ${report.period.start} ~ ${report.period.end}</p>
    
    <h2>요약</h2>
    <div class="metric">
        <strong>수집된 기사:</strong> ${report.summary.totalArticlesCollected}개
    </div>
    <div class="metric">
        <strong>생성된 글:</strong> ${report.summary.totalArticlesGenerated}개
    </div>
    <div class="metric">
        <strong>평균 품질 점수:</strong> 
        <span class="${report.summary.averageQualityScore >= 80 ? 'good' : 'warning'}">
            ${report.summary.averageQualityScore.toFixed(1)}점
        </span>
    </div>
    
    <h2>추천 사항</h2>
    <ul>
        ${report.recommendations.map(rec => `
            <li class="${rec.priority}">
                [${rec.priority}] ${rec.action} - ${rec.reason}
            </li>
        `).join('')}
    </ul>
</body>
</html>
        `;
        
        await fs.writeFile(outputPath, html, 'utf8');
    }
    
    async validateResult() {
        return this.result && 
               this.result.summary !== null &&
               this.result.period !== null;
    }
}

// Job Manager 클래스
class JobManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.jobs = new Map();
        this.queue = [];
        this.running = new Set();
        this.maxConcurrent = config.maxConcurrent || 3;
        this.stateFile = path.join(__dirname, '../../data/jobs/job-state.json');
        this.isRunning = false;
        
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            // 상태 디렉토리 생성
            await fs.ensureDir(path.dirname(this.stateFile));
            
            // 이전 상태 로드
            await this.loadState();
            
            console.log('✅ Job Manager 초기화 완료');
            
        } catch (error) {
            console.error('Job Manager 초기화 실패:', error);
        }
    }
    
    createJob(type, config = {}) {
        const jobId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        let job;
        
        switch (type) {
            case JobTypes.ARTICLE_COLLECTION:
                job = new ArticleCollectionJob(jobId, config);
                break;
            case JobTypes.CONTENT_ANALYSIS:
                job = new ContentAnalysisJob(jobId, config);
                break;
            case JobTypes.ARTICLE_GENERATION:
                job = new ArticleGenerationJob(jobId, config);
                break;
            case JobTypes.STYLE_UPDATE:
                job = new StyleUpdateJob(jobId, config);
                break;
            case JobTypes.REPORT_GENERATION:
                job = new ReportGenerationJob(jobId, config);
                break;
            case JobTypes.BRUNCH_PUBLISH:
                const BrunchPublishJob = require('./brunchPublishJob');
                job = new BrunchPublishJob(jobId, config);
                break;
            default:
                throw new Error(`Unknown job type: ${type}`);
        }
        
        this.jobs.set(jobId, job);
        this.emit('job:created', job);
        
        return job;
    }
    
    async enqueueJob(job) {
        // 의존성 확인
        if (job.dependencies.length > 0) {
            const pendingDeps = await this.checkDependencies(job);
            if (pendingDeps.length > 0) {
                console.log(`⏳ Job ${job.id} 대기 중 (의존성: ${pendingDeps.join(', ')})`);
                job.status = JobStatus.PENDING;
                this.queue.push(job);
                await this.saveState();
                return;
            }
        }
        
        this.queue.push(job);
        await this.saveState();
        this.emit('job:enqueued', job);
        
        if (this.isRunning) {
            this.processQueue();
        }
    }
    
    async processQueue() {
        while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
            const job = this.queue.shift();
            
            // 의존성 재확인
            if (job.dependencies.length > 0) {
                const pendingDeps = await this.checkDependencies(job);
                if (pendingDeps.length > 0) {
                    this.queue.push(job); // 다시 큐에 추가
                    continue;
                }
            }
            
            this.executeJob(job);
        }
    }
    
    async executeJob(job) {
        try {
            this.running.add(job.id);
            job.status = JobStatus.RUNNING;
            job.startedAt = new Date().toISOString();
            
            this.emit('job:started', job);
            console.log(`🚀 Job 시작: ${job.type} (${job.id})`);
            
            // Job 실행
            const startTime = Date.now();
            const result = await job.execute();
            
            // 결과 검증
            const isValid = await job.validateResult();
            
            if (isValid) {
                job.status = JobStatus.COMPLETED;
                job.completedAt = new Date().toISOString();
                job.executionTime = Date.now() - startTime;
                
                this.emit('job:completed', job);
                console.log(`✅ Job 완료: ${job.type} (${(job.executionTime / 1000).toFixed(2)}초)`);
            } else {
                throw new Error('Job 결과 검증 실패');
            }
            
        } catch (error) {
            job.status = JobStatus.FAILED;
            job.error = error.message;
            job.completedAt = new Date().toISOString();
            
            console.error(`❌ Job 실패: ${job.type} - ${error.message}`);
            
            // 재시도 로직
            if (job.retryCount < job.maxRetries) {
                job.retryCount++;
                job.status = JobStatus.RETRYING;
                console.log(`🔄 재시도 예정 (${job.retryCount}/${job.maxRetries})`);
                
                setTimeout(() => {
                    this.queue.unshift(job); // 큐 앞쪽에 추가
                    this.processQueue();
                }, 5000 * job.retryCount); // 재시도마다 딜레이 증가
            } else {
                this.emit('job:failed', job);
            }
            
        } finally {
            this.running.delete(job.id);
            await this.saveState();
            
            // 다음 작업 처리
            if (this.isRunning) {
                this.processQueue();
            }
        }
    }
    
    async checkDependencies(job) {
        const pendingDeps = [];
        
        for (const depType of job.dependencies) {
            const recentJob = await this.getRecentJobByType(depType);
            
            if (!recentJob || recentJob.status !== JobStatus.COMPLETED) {
                pendingDeps.push(depType);
            }
        }
        
        return pendingDeps;
    }
    
    async getRecentJobByType(type, maxAge = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let recentJob = null;
        
        for (const [id, job] of this.jobs) {
            if (job.type === type && job.status === JobStatus.COMPLETED) {
                const jobAge = now - new Date(job.completedAt).getTime();
                
                if (jobAge <= maxAge) {
                    if (!recentJob || new Date(job.completedAt) > new Date(recentJob.completedAt)) {
                        recentJob = job;
                    }
                }
            }
        }
        
        return recentJob;
    }
    
    start() {
        this.isRunning = true;
        console.log('🚀 Job Manager 시작됨');
        this.processQueue();
    }
    
    stop() {
        this.isRunning = false;
        console.log('⏹️ Job Manager 중지됨');
    }
    
    async saveState() {
        try {
            const state = {
                jobs: Array.from(this.jobs.values()).map(job => job.toJSON()),
                queue: this.queue.map(job => job.id),
                running: Array.from(this.running),
                savedAt: new Date().toISOString()
            };
            
            await fs.writeJson(this.stateFile, state, { spaces: 2 });
            
        } catch (error) {
            console.error('상태 저장 실패:', error);
        }
    }
    
    async loadState() {
        try {
            if (await fs.pathExists(this.stateFile)) {
                const state = await fs.readJson(this.stateFile);
                
                // Job 복원 (실행 중이던 작업은 큐로 이동)
                state.jobs?.forEach(jobData => {
                    if (jobData.status === JobStatus.RUNNING) {
                        jobData.status = JobStatus.PENDING;
                        jobData.startedAt = null;
                    }
                });
                
                console.log(`📂 ${state.jobs?.length || 0}개 Job 상태 복원됨`);
            }
            
        } catch (error) {
            console.error('상태 로드 실패:', error);
        }
    }
    
    getStatus() {
        return {
            totalJobs: this.jobs.size,
            queueLength: this.queue.length,
            runningJobs: this.running.size,
            isRunning: this.isRunning,
            jobs: Array.from(this.jobs.values()).map(job => ({
                id: job.id,
                type: job.type,
                status: job.status,
                createdAt: job.createdAt,
                executionTime: job.executionTime
            }))
        };
    }
    
    getJob(jobId) {
        return this.jobs.get(jobId);
    }
    
    async clearCompletedJobs(olderThan = 7 * 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let cleared = 0;
        
        for (const [id, job] of this.jobs) {
            if (job.status === JobStatus.COMPLETED) {
                const age = now - new Date(job.completedAt).getTime();
                if (age > olderThan) {
                    this.jobs.delete(id);
                    cleared++;
                }
            }
        }
        
        if (cleared > 0) {
            await this.saveState();
            console.log(`🧹 ${cleared}개의 완료된 Job 정리됨`);
        }
        
        return cleared;
    }
}

// 싱글톤 인스턴스
let managerInstance = null;

function getJobManager(config) {
    if (!managerInstance) {
        managerInstance = new JobManager(config);
    }
    return managerInstance;
}

module.exports = {
    JobManager,
    getJobManager,
    JobTypes,
    JobStatus,
    BaseJob,
    ArticleCollectionJob,
    ContentAnalysisJob,
    ArticleGenerationJob,
    StyleUpdateJob,
    ReportGenerationJob
};