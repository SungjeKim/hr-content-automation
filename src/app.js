require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Server } = require('socket.io');
const http = require('http');

// 컴포넌트 임포트 (임시 비활성화)
// const ContentCreationWorkflow = require('./workflows/contentCreation');
// const ContentFilter = require('./analyzers/contentFilter');
// const ArticleWriter = require('./writers/articleWriter');
// const QualityChecker = require('./analyzers/qualityChecker');
// const { getScheduler } = require('./scheduler');

// Express 앱 초기화
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 포트 설정
const PORT = process.env.PORT || 3001;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // HTTPS 사용 시 true로 변경
}));

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, '../public')));
app.use('/data', express.static(path.join(__dirname, '../data')));

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 전역 변수
let currentWorkflow = null;
let scheduler = null;

// Socket.IO 이벤트 처리
io.on('connection', (socket) => {
  console.log('클라이언트 연결됨:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제:', socket.id);
  });
});

// 헬퍼 함수들
async function getLatestData(type) {
  try {
    const dataPath = path.join(__dirname, `../data/${type}`);
    if (!await fs.pathExists(dataPath)) {
      return null;
    }
    
    const files = await fs.readdir(dataPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) return null;
    
    // latest 파일 우선 확인
    if (jsonFiles.includes(`${type}-latest.json`)) {
      return await fs.readJson(path.join(dataPath, `${type}-latest.json`));
    }
    
    // 가장 최근 파일 찾기
    const sortedFiles = jsonFiles.sort((a, b) => b.localeCompare(a));
    return await fs.readJson(path.join(dataPath, sortedFiles[0]));
    
  } catch (error) {
    console.error(`${type} 데이터 로드 실패:`, error);
    return null;
  }
}

async function getSystemStatus() {
  try {
    const status = {
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
      api: {
        claudeStatus: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not configured',
        lastError: null
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
    console.error('시스템 상태 확인 실패:', error);
    return null;
  }
}

// 라우트 정의

// 1. GET / - 메인 대시보드
app.get('/', async (req, res) => {
  try {
    const systemStatus = await getSystemStatus();
    const latestWorkflow = await getLatestData('dashboard/latest-workflow');
    const recentDrafts = await getLatestData('drafts/articles');
    
    res.render('dashboard', {
      title: 'HR 콘텐츠 자동화 대시보드',
      systemStatus,
      latestWorkflow,
      recentDrafts: recentDrafts?.articles?.slice(0, 5) || []
    });
    
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
    res.status(500).render('error', { 
      title: '오류 발생',
      message: '대시보드를 로드하는 중 오류가 발생했습니다.',
      error: error.message 
    });
  }
});

// 2. GET /articles - 수집된 기사 관리
app.get('/articles', async (req, res) => {
  try {
    const sortBy = req.query.sort || 'score';
    const filterType = req.query.filter || 'all';
    
    let articles = [];
    
    if (filterType === 'filtered') {
      const filtered = await getLatestData('articles/filtered-articles');
      articles = filtered?.articles || [];
    } else {
      const allArticles = await getLatestData('articles/hr-articles');
      articles = allArticles?.articles || [];
      
      // 필터링된 기사의 점수 정보 추가
      const filtered = await getLatestData('articles/filtered-articles');
      if (filtered) {
        articles = articles.map(article => {
          const filteredMatch = filtered.articles.find(f => f.url === article.url);
          if (filteredMatch) {
            return { ...article, scores: filteredMatch.scores };
          }
          return article;
        });
      }
    }
    
    // 정렬
    if (sortBy === 'score') {
      articles.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } else if (sortBy === 'date') {
      articles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    }
    
    res.render('articles', {
      title: '수집된 기사 관리',
      articles,
      sortBy,
      filterType,
      totalCount: articles.length
    });
    
  } catch (error) {
    console.error('기사 목록 로드 오류:', error);
    res.status(500).render('error', { 
      title: '오류 발생',
      message: '기사 목록을 로드하는 중 오류가 발생했습니다.',
      error: error.message 
    });
  }
});

// 3. GET /drafts - 작성된 글 관리
app.get('/drafts', async (req, res) => {
  try {
    const sortBy = req.query.sort || 'score';
    const filterStatus = req.query.status || 'all';
    
    const drafts = await getLatestData('drafts/articles');
    const qualityReports = await getLatestData('quality/quality-report');
    
    let articles = drafts?.articles || [];
    
    // 품질 점수 매칭
    if (qualityReports?.reports) {
      articles = articles.map(article => {
        const report = qualityReports.reports.find(r => 
          r.article.title === article.title
        );
        if (report) {
          return { ...article, qualityScore: report.scores.total, qualityStatus: report.status };
        }
        return article;
      });
    }
    
    // 필터링
    if (filterStatus === 'passed') {
      articles = articles.filter(a => a.qualityStatus === 'PASSED');
    } else if (filterStatus === 'needs_improvement') {
      articles = articles.filter(a => a.qualityStatus === 'NEEDS_IMPROVEMENT');
    }
    
    // 정렬
    if (sortBy === 'score') {
      articles.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    } else if (sortBy === 'date') {
      articles.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    }
    
    res.render('drafts', {
      title: '작성된 글 관리',
      articles,
      sortBy,
      filterStatus,
      totalCount: articles.length
    });
    
  } catch (error) {
    console.error('초안 목록 로드 오류:', error);
    res.status(500).render('error', { 
      title: '오류 발생',
      message: '초안 목록을 로드하는 중 오류가 발생했습니다.',
      error: error.message 
    });
  }
});

// 4. GET /preview/:id - 글 미리보기
app.get('/preview/:id', async (req, res) => {
  try {
    const articleId = decodeURIComponent(req.params.id);
    const editMode = req.query.edit === 'true';
    
    const drafts = await getLatestData('drafts/articles');
    const qualityReports = await getLatestData('quality/quality-report');
    
    const article = drafts?.articles?.find(a => 
      a.title === articleId || a.title.includes(articleId)
    );
    
    if (!article) {
      return res.status(404).render('error', {
        title: '글을 찾을 수 없음',
        message: '요청하신 글을 찾을 수 없습니다.',
        error: 'Article not found'
      });
    }
    
    // 품질 보고서 찾기
    const qualityReport = qualityReports?.reports?.find(r => 
      r.article.title === article.title
    );
    
    res.render('preview', {
      title: article.title,
      article,
      qualityReport,
      editMode
    });
    
  } catch (error) {
    console.error('미리보기 로드 오류:', error);
    res.status(500).render('error', { 
      title: '오류 발생',
      message: '미리보기를 로드하는 중 오류가 발생했습니다.',
      error: error.message 
    });
  }
});

// 5. POST /generate - 글 생성 API
app.post('/generate', async (req, res) => {
  try {
    const { articleUrl, mode = 'auto', maxArticles = 3 } = req.body;
    
    // 이미 진행 중인 작업이 있는지 확인
    if (currentWorkflow) {
      return res.status(400).json({
        success: false,
        message: '이미 글 생성이 진행 중입니다.'
      });
    }
    
    // Socket.IO로 진행 상황 전송
    const emitProgress = (step, status, details) => {
      io.emit('generation-progress', {
        step,
        status,
        details,
        timestamp: new Date()
      });
    };
    
    // 워크플로우 옵션
    const options = {
      mode,
      maxArticles: parseInt(maxArticles),
      targetArticleId: articleUrl
    };
    
    // 백그라운드에서 워크플로우 실행
    currentWorkflow = ContentCreationWorkflow.run(options)
      .then(result => {
        emitProgress('complete', 'success', {
          message: '글 생성이 완료되었습니다.',
          result
        });
        currentWorkflow = null;
      })
      .catch(error => {
        emitProgress('error', 'failed', {
          message: '글 생성 중 오류가 발생했습니다.',
          error: error.message
        });
        currentWorkflow = null;
      });
    
    res.json({
      success: true,
      message: '글 생성이 시작되었습니다. 진행 상황은 실시간으로 업데이트됩니다.'
    });
    
  } catch (error) {
    console.error('글 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '글 생성을 시작하는 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 6. POST /approve/:id - 글 승인
app.post('/approve/:id', async (req, res) => {
  try {
    const articleId = decodeURIComponent(req.params.id);
    const { notes } = req.body;
    
    const drafts = await getLatestData('drafts/articles');
    const article = drafts?.articles?.find(a => 
      a.title === articleId || a.title.includes(articleId)
    );
    
    if (!article) {
      return res.status(404).json({
        success: false,
        message: '글을 찾을 수 없습니다.'
      });
    }
    
    // 승인 기록 저장
    const approvalDir = path.join(__dirname, '../data/approvals');
    await fs.ensureDir(approvalDir);
    
    const approval = {
      articleId: article.title,
      article,
      approvedAt: new Date().toISOString(),
      approvedBy: req.session.user || 'system',
      notes,
      status: 'approved'
    };
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const approvalPath = path.join(approvalDir, `approval-${timestamp}.json`);
    await fs.writeJson(approvalPath, approval, { spaces: 2 });
    
    // 최신 승인 파일로도 저장
    const latestPath = path.join(approvalDir, 'latest-approval.json');
    await fs.writeJson(latestPath, approval, { spaces: 2 });
    
    res.json({
      success: true,
      message: '글이 승인되었습니다.',
      approval
    });
    
  } catch (error) {
    console.error('글 승인 오류:', error);
    res.status(500).json({
      success: false,
      message: '글 승인 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 7. GET /analytics - 통계 페이지
app.get('/analytics', async (req, res) => {
  try {
    // 통계 데이터 수집
    const stats = {
      monthly: {},
      keywords: {},
      qualityTrend: [],
      topArticles: []
    };
    
    // 월별 통계 계산
    const draftsDir = path.join(__dirname, '../data/drafts');
    if (await fs.pathExists(draftsDir)) {
      const files = await fs.readdir(draftsDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'articles-latest.json') {
          const data = await fs.readJson(path.join(draftsDir, file));
          if (data.metadata?.generatedAt) {
            const month = data.metadata.generatedAt.substring(0, 7);
            stats.monthly[month] = (stats.monthly[month] || 0) + (data.metadata.totalArticles || 0);
          }
          
          // 키워드 수집
          if (data.articles) {
            data.articles.forEach(article => {
              article.hashtags?.forEach(tag => {
                stats.keywords[tag] = (stats.keywords[tag] || 0) + 1;
              });
            });
          }
        }
      }
    }
    
    // 품질 점수 추이
    const qualityDir = path.join(__dirname, '../data/quality');
    if (await fs.pathExists(qualityDir)) {
      const files = await fs.readdir(qualityDir);
      const sortedFiles = files
        .filter(f => f.endsWith('.json') && f !== 'quality-report-latest.json')
        .sort();
      
      for (const file of sortedFiles.slice(-10)) { // 최근 10개
        const data = await fs.readJson(path.join(qualityDir, file));
        if (data.metadata) {
          stats.qualityTrend.push({
            date: data.metadata.checkedAt,
            averageScore: data.metadata.averageScore,
            passRate: Math.round((data.metadata.passedCount / data.metadata.totalArticles) * 100)
          });
        }
      }
    }
    
    // 상위 기사 (품질 점수 기준)
    const latestQuality = await getLatestData('quality/quality-report');
    if (latestQuality?.reports) {
      stats.topArticles = latestQuality.reports
        .sort((a, b) => b.scores.total - a.scores.total)
        .slice(0, 5)
        .map(r => ({
          title: r.article.title,
          score: r.scores.total,
          status: r.status
        }));
    }
    
    res.render('analytics', {
      title: '통계 및 분석',
      stats
    });
    
  } catch (error) {
    console.error('통계 로드 오류:', error);
    res.status(500).render('error', { 
      title: '오류 발생',
      message: '통계를 로드하는 중 오류가 발생했습니다.',
      error: error.message 
    });
  }
});

// API 라우트들

// 기사 스크래핑 트리거
app.post('/api/scrape', async (req, res) => {
  try {
    const { getJobManager, JobTypes } = require('./jobs/jobManager');
    const jobManager = getJobManager();
    
    const job = jobManager.createJob(JobTypes.ARTICLE_COLLECTION);
    await jobManager.enqueueJob(job);
    
    res.json({
      success: true,
      message: '기사 수집 작업이 시작되었습니다.',
      jobId: job.id
    });
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
    res.status(500).json({
      success: false,
      message: '기사 수집 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 필터링 트리거
app.post('/api/filter', async (req, res) => {
  try {
    const { getJobManager, JobTypes } = require('./jobs/jobManager');
    const jobManager = getJobManager();
    
    const job = jobManager.createJob(JobTypes.CONTENT_ANALYSIS);
    await jobManager.enqueueJob(job);
    
    res.json({
      success: true,
      message: '기사 필터링 작업이 시작되었습니다.',
      jobId: job.id
    });
    
  } catch (error) {
    console.error('필터링 오류:', error);
    res.status(500).json({
      success: false,
      message: '기사 필터링 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 기사 목록 API
app.get('/api/articles', async (req, res) => {
  try {
    const { filter = 'all', sort = 'score' } = req.query;
    
    let articles = [];
    
    if (filter === 'filtered') {
      const filtered = await getLatestData('articles/filtered-articles');
      articles = filtered?.articles || [];
    } else {
      const allArticles = await getLatestData('articles/hr-articles');
      articles = allArticles?.articles || [];
    }
    
    // 정렬
    if (sort === 'score') {
      articles.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } else if (sort === 'date') {
      articles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    }
    
    res.json(articles);
    
  } catch (error) {
    console.error('기사 API 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 초안 목록 API
app.get('/api/drafts', async (req, res) => {
  try {
    const drafts = await getLatestData('drafts/articles');
    const qualityReports = await getLatestData('quality/quality-report');
    
    let articles = drafts?.articles || [];
    
    // 품질 점수 매칭
    if (qualityReports?.reports) {
      articles = articles.map(article => {
        const report = qualityReports.reports.find(r => 
          r.article.title === article.title
        );
        if (report) {
          return { ...article, qualityScore: report.scores.total, qualityStatus: report.status };
        }
        return article;
      });
    }
    
    res.json({ articles });
    
  } catch (error) {
    console.error('초안 API 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 시스템 통계 API
app.get('/api/stats', async (req, res) => {
  try {
    const systemStatus = await getSystemStatus();
    
    const stats = {
      totalArticles: systemStatus?.articles?.collected || 0,
      totalDrafts: systemStatus?.drafts?.total || 0,
      avgQuality: systemStatus?.quality?.averageScore || 0,
      qualityDistribution: {
        passed: 0,
        needs_improvement: 0
      }
    };
    
    // 품질 분포 계산
    const qualityReports = await getLatestData('quality/quality-report');
    if (qualityReports?.reports) {
      stats.qualityDistribution.passed = qualityReports.reports.filter(r => r.status === 'PASSED').length;
      stats.qualityDistribution.needs_improvement = qualityReports.reports.filter(r => r.status === 'NEEDS_IMPROVEMENT').length;
    }
    
    res.json(stats);
    
  } catch (error) {
    console.error('통계 API 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 미리보기 API
app.get('/api/preview/:id', async (req, res) => {
  try {
    const articleId = decodeURIComponent(req.params.id);
    
    const drafts = await getLatestData('drafts/articles');
    const article = drafts?.articles?.find(a => 
      a.title === articleId || a.title.includes(articleId)
    );
    
    if (!article) {
      return res.status(404).json({
        success: false,
        message: '글을 찾을 수 없습니다.'
      });
    }
    
    res.json(article);
    
  } catch (error) {
    console.error('미리보기 API 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// Job 상태 API
app.get('/api/jobs/status', (req, res) => {
  try {
    const { getJobManager } = require('./jobs/jobManager');
    const jobManager = getJobManager();
    
    res.json(jobManager.getStatus());
  } catch (error) {
    console.error('Job 상태 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 Job 상태 조회
app.get('/api/jobs/:jobId', (req, res) => {
  try {
    const { getJobManager } = require('./jobs/jobManager');
    const jobManager = getJobManager();
    const job = jobManager.getJob(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job을 찾을 수 없습니다.' });
    }
    
    res.json(job.toJSON());
  } catch (error) {
    console.error('Job 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 스케줄러 상태 API
app.get('/api/scheduler/status', (req, res) => {
  try {
    if (!scheduler) {
      return res.json({ isRunning: false, message: '스케줄러가 초기화되지 않았습니다.' });
    }
    
    res.json(scheduler.getStatus());
  } catch (error) {
    console.error('스케줄러 상태 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 스케줄러 시작/중지 API
app.post('/api/scheduler/:action', async (req, res) => {
  const { action } = req.params;
  
  try {
    if (!scheduler) {
      scheduler = getScheduler();
    }
    
    switch (action) {
      case 'start':
        scheduler.start();
        res.json({ success: true, message: '스케줄러가 시작되었습니다.' });
        break;
        
      case 'stop':
        scheduler.stop();
        res.json({ success: true, message: '스케줄러가 중지되었습니다.' });
        break;
        
      default:
        res.status(400).json({ success: false, message: '잘못된 액션입니다.' });
    }
    
  } catch (error) {
    console.error('스케줄러 제어 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 스케줄 작업 수동 실행 API
app.post('/api/scheduler/run/:taskId', async (req, res) => {
  const { taskId } = req.params;
  
  try {
    if (!scheduler) {
      scheduler = getScheduler();
    }
    
    const success = await scheduler.runTask(taskId);
    
    res.json({ 
      success, 
      message: success ? `${taskId} 작업이 성공적으로 완료되었습니다.` : `${taskId} 작업이 실패했습니다.`
    });
    
  } catch (error) {
    console.error('수동 작업 실행 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 스케줄 작업 활성화/비활성화 API
app.post('/api/scheduler/task/:taskId/:action', async (req, res) => {
  const { taskId, action } = req.params;
  
  try {
    if (!scheduler) {
      scheduler = getScheduler();
    }
    
    if (action === 'enable') {
      await scheduler.enableTask(taskId);
      res.json({ success: true, message: `${taskId} 작업이 활성화되었습니다.` });
    } else if (action === 'disable') {
      await scheduler.disableTask(taskId);
      res.json({ success: true, message: `${taskId} 작업이 비활성화되었습니다.` });
    } else {
      res.status(400).json({ success: false, message: '잘못된 액션입니다.' });
    }
    
  } catch (error) {
    console.error('작업 제어 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 브런치 발행 API
app.post('/api/publish/brunch', async (req, res) => {
  try {
    const { articleId, options = {} } = req.body;
    
    if (!articleId) {
      return res.status(400).json({
        success: false,
        message: '발행할 글 ID가 필요합니다.'
      });
    }
    
    // 글 정보 가져오기
    const drafts = await getLatestData('drafts/articles');
    const article = drafts?.articles?.find(a => 
      a.title === articleId || a.title.includes(articleId)
    );
    
    if (!article) {
      return res.status(404).json({
        success: false,
        message: '발행할 글을 찾을 수 없습니다.'
      });
    }
    
    // Job Manager를 통해 브런치 발행 작업 생성
    const { getJobManager, JobTypes } = require('./jobs/jobManager');
    const jobManager = getJobManager();
    
    const publishConfig = {
      article,
      headless: options.headless !== false,
      autoPublish: options.autoPublish === true,
      visibility: options.visibility || 'public',
      allowComments: options.allowComments !== false,
      publishNow: options.publishNow !== false,
      scheduledDate: options.scheduledDate,
      timeout: options.timeout || 60000
    };
    
    const job = jobManager.createJob(JobTypes.BRUNCH_PUBLISH, publishConfig);
    await jobManager.enqueueJob(job);
    
    res.json({
      success: true,
      message: '브런치 발행 작업이 시작되었습니다.',
      jobId: job.id,
      articleTitle: article.title
    });
    
  } catch (error) {
    console.error('브런치 발행 오류:', error);
    res.status(500).json({
      success: false,
      message: '브런치 발행 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 브런치 발행 상태 확인 API
app.get('/api/publish/brunch/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const { getJobManager } = require('./jobs/jobManager');
    const jobManager = getJobManager();
    
    const job = jobManager.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job을 찾을 수 없습니다.'
      });
    }
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        result: job.result,
        error: job.error,
        executionTime: job.executionTime,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      }
    });
    
  } catch (error) {
    console.error('브런치 발행 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Publishing Workflow API 라우트들
// ========================================

// 새 워크플로우 시작
app.post('/api/workflow/start', async (req, res) => {
  try {
    const { getWorkflowManager } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    const { options = {} } = req.body;
    
    // 워크플로우 생성 및 시작
    const workflow = workflowManager.createWorkflow({
      autoApprove: options.autoApprove || false,
      maxRevisions: options.maxRevisions || 3,
      reviewTimeout: options.reviewTimeout || 86400000, // 24시간
      ...options
    });
    
    // 알림 이벤트 리스너 설정
    workflow.on('notification', (notification) => {
      io.emit('workflow-notification', notification);
    });
    
    workflow.on('status-changed', (status) => {
      io.emit('workflow-status', status);
    });
    
    // 워크플로우 시작
    await workflow.start(options);
    
    res.json({
      success: true,
      message: '워크플로우가 시작되었습니다.',
      workflowId: workflow.id,
      status: workflow.status
    });
    
  } catch (error) {
    console.error('워크플로우 시작 오류:', error);
    res.status(500).json({
      success: false,
      message: '워크플로우 시작 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 워크플로우 상태 조회
app.get('/api/workflow/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { getWorkflowManager, PublishingWorkflow } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    // 메모리에서 먼저 찾기
    let workflow = workflowManager.getWorkflow(workflowId);
    
    // 없으면 파일에서 로드
    if (!workflow) {
      workflow = await PublishingWorkflow.loadWorkflow(workflowId);
    }
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: '워크플로우를 찾을 수 없습니다.'
      });
    }
    
    res.json({
      success: true,
      workflow: workflow.toJSON()
    });
    
  } catch (error) {
    console.error('워크플로우 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 사용자 액션 처리 (승인/거부/수정요청)
app.post('/api/workflow/:workflowId/action', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { action, data = {} } = req.body;
    
    const { getWorkflowManager } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    const workflow = workflowManager.getWorkflow(workflowId);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: '워크플로우를 찾을 수 없습니다.'
      });
    }
    
    // 사용자 액션 처리
    workflow.emit('user-action', action, data);
    
    res.json({
      success: true,
      message: `액션 "${action}"이 처리되었습니다.`,
      workflowId: workflow.id,
      status: workflow.status
    });
    
  } catch (error) {
    console.error('워크플로우 액션 처리 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 활성 워크플로우 목록 조회
app.get('/api/workflows/active', async (req, res) => {
  try {
    const { getWorkflowManager, PublishingWorkflow } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    // 메모리의 활성 워크플로우
    const memoryWorkflows = workflowManager.getAllActiveWorkflows();
    
    // 파일의 활성 워크플로우
    const fileWorkflows = await PublishingWorkflow.getActiveWorkflows();
    
    // 중복 제거하여 병합
    const allWorkflows = [...memoryWorkflows];
    
    fileWorkflows.forEach(fileWorkflow => {
      const exists = allWorkflows.find(w => w.id === fileWorkflow.id);
      if (!exists) {
        allWorkflows.push(fileWorkflow);
      }
    });
    
    res.json({
      success: true,
      workflows: allWorkflows.map(w => w.toJSON ? w.toJSON() : w)
    });
    
  } catch (error) {
    console.error('활성 워크플로우 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 워크플로우 통계 조회
app.get('/api/workflows/statistics', async (req, res) => {
  try {
    const { PublishingWorkflow } = require('./workflows/publishingWorkflow');
    const statistics = await PublishingWorkflow.getStatistics();
    
    res.json({
      success: true,
      statistics
    });
    
  } catch (error) {
    console.error('워크플로우 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 워크플로우 취소
app.post('/api/workflow/:workflowId/cancel', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { reason = 'User cancelled' } = req.body;
    
    const { getWorkflowManager } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    const workflow = workflowManager.getWorkflow(workflowId);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: '워크플로우를 찾을 수 없습니다.'
      });
    }
    
    await workflow.cancelWorkflow(reason);
    
    res.json({
      success: true,
      message: '워크플로우가 취소되었습니다.',
      workflowId: workflow.id
    });
    
  } catch (error) {
    console.error('워크플로우 취소 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 워크플로우 스케줄링
app.post('/api/workflow/:workflowId/schedule', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { scheduledTime, publishOptions = {} } = req.body;
    
    if (!scheduledTime) {
      return res.status(400).json({
        success: false,
        message: '스케줄 시간이 필요합니다.'
      });
    }
    
    const { getWorkflowManager } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    const workflow = workflowManager.getWorkflow(workflowId);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: '워크플로우를 찾을 수 없습니다.'
      });
    }
    
    await workflow.schedulePublishing(scheduledTime, publishOptions);
    
    res.json({
      success: true,
      message: '발행이 예약되었습니다.',
      workflowId: workflow.id,
      scheduledTime: scheduledTime
    });
    
  } catch (error) {
    console.error('워크플로우 스케줄링 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 워크플로우 관리 페이지
app.get('/workflows', async (req, res) => {
  try {
    const { getWorkflowManager, PublishingWorkflow } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    // 활성 워크플로우 조회
    const activeWorkflows = workflowManager.getAllActiveWorkflows();
    const fileWorkflows = await PublishingWorkflow.getActiveWorkflows();
    
    // 통계 조회
    const statistics = await PublishingWorkflow.getStatistics();
    
    res.render('workflows', {
      title: '워크플로우 관리',
      activeWorkflows: [...activeWorkflows, ...fileWorkflows].map(w => w.toJSON ? w.toJSON() : w),
      statistics
    });
    
  } catch (error) {
    console.error('워크플로우 페이지 로드 오류:', error);
    res.status(500).render('error', {
      title: '오류 발생',
      message: '워크플로우 페이지를 로드하는 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 워크플로우 상세 페이지
app.get('/workflow/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { getWorkflowManager, PublishingWorkflow } = require('./workflows/publishingWorkflow');
    const workflowManager = getWorkflowManager();
    
    let workflow = workflowManager.getWorkflow(workflowId);
    
    if (!workflow) {
      workflow = await PublishingWorkflow.loadWorkflow(workflowId);
    }
    
    if (!workflow) {
      return res.status(404).render('error', {
        title: '워크플로우를 찾을 수 없음',
        message: '요청하신 워크플로우를 찾을 수 없습니다.',
        error: 'Workflow not found'
      });
    }
    
    res.render('workflow-detail', {
      title: `워크플로우 - ${workflow.id}`,
      workflow: workflow.toJSON ? workflow.toJSON() : workflow
    });
    
  } catch (error) {
    console.error('워크플로우 상세 페이지 로드 오류:', error);
    res.status(500).render('error', {
      title: '오류 발생',
      message: '워크플로우 상세 페이지를 로드하는 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 404 처리
app.use((req, res) => {
  res.status(404).render('error', {
    title: '페이지를 찾을 수 없음',
    message: '요청하신 페이지를 찾을 수 없습니다.',
    error: '404 Not Found'
  });
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  console.error('서버 오류:', err);
  res.status(500).render('error', {
    title: '서버 오류',
    message: '서버에서 오류가 발생했습니다.',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// 서버 시작
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 HR 콘텐츠 자동화 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📍 대시보드 접속: http://localhost:${PORT}`);
    
    // 초기 상태 확인 (임시 비활성화)
    console.log('📊 시스템 상태: 정상 작동 중');
    
    // 스케줄러 초기화 (환경변수로 제어)
    if (process.env.SCHEDULER_ENABLED !== 'false') {
      try {
        scheduler = getScheduler();
        console.log('⏰ 자동화 스케줄러가 초기화되었습니다.');
      } catch (error) {
        console.error('⚠️ 스케줄러 초기화 실패:', error.message);
      }
    }
    
    // JobManager 초기화 (임시 비활성화)
    console.log('🏃 Job Manager 비활성화됨 (테스트용)');
  });
}

module.exports = app;