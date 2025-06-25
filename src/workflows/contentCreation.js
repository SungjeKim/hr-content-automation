require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const ContentFilter = require('../analyzers/contentFilter');
const ArticleWriter = require('../writers/articleWriter');
const QualityChecker = require('../analyzers/qualityChecker');

class ContentCreationWorkflow {
  constructor(options = {}) {
    this.mode = options.mode || 'auto'; // auto, selection, custom
    this.maxArticles = options.maxArticles || 3;
    this.targetArticleId = options.targetArticleId || null;
    
    // 컴포넌트 초기화
    this.contentFilter = new ContentFilter();
    this.articleWriter = new ArticleWriter();
    this.qualityChecker = new QualityChecker();
    
    // 워크플로우 데이터
    this.workflowData = {
      startTime: new Date(),
      steps: [],
      results: {
        articles: [],
        selectedArticle: null,
        qualityReports: [],
        outputs: {}
      },
      stats: {
        totalSteps: 7,
        completedSteps: 0,
        tokensUsed: 0,
        estimatedCost: 0,
        successRate: 0
      }
    };
    
    // 토큰 비용 계산 (Anthropic Claude 3 Haiku 기준)
    this.tokenCosts = {
      input: 0.00025 / 1000,  // $0.25 per 1M input tokens
      output: 0.00125 / 1000  // $1.25 per 1M output tokens
    };
  }

  // 워크플로우 단계 로깅
  logStep(stepName, status, details = {}) {
    const step = {
      name: stepName,
      status, // 'started', 'completed', 'failed'
      timestamp: new Date(),
      details,
      duration: null
    };
    
    if (status === 'started') {
      step.startTime = new Date();
    } else if (status === 'completed' || status === 'failed') {
      const startedStep = this.workflowData.steps.find(s => 
        s.name === stepName && s.status === 'started'
      );
      if (startedStep) {
        step.duration = new Date() - startedStep.startTime;
      }
      this.workflowData.stats.completedSteps++;
    }
    
    this.workflowData.steps.push(step);
    
    const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '🔄';
    console.log(`${emoji} [${stepName}] ${status.toUpperCase()}${details.message ? ': ' + details.message : ''}`);
  }

  // 1단계: 오늘 수집된 기사 목록 불러오기
  async loadTodaysArticles() {
    this.logStep('기사 목록 로딩', 'started');
    
    try {
      await this.contentFilter.loadArticles();
      const articles = this.contentFilter.articles;
      
      if (articles.length === 0) {
        throw new Error('수집된 기사가 없습니다.');
      }
      
      this.logStep('기사 목록 로딩', 'completed', {
        message: `${articles.length}개 기사 로딩 완료`,
        count: articles.length
      });
      
      return articles;
      
    } catch (error) {
      this.logStep('기사 목록 로딩', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // 2단계: 상위 기사 자동 선별
  async selectTopArticles(articles) {
    this.logStep('상위 기사 선별', 'started');
    
    try {
      let selectedArticles;
      
      if (this.mode === 'custom' && this.targetArticleId) {
        // 커스텀 모드: 특정 기사 선택
        const targetArticle = articles.find(a => a.url === this.targetArticleId);
        if (!targetArticle) {
          throw new Error('지정된 기사를 찾을 수 없습니다.');
        }
        selectedArticles = [targetArticle];
      } else {
        // 자동/선택 모드: 상위 기사 선별
        const sortedArticles = articles
          .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
          .slice(0, this.maxArticles);
        
        selectedArticles = sortedArticles;
      }
      
      this.logStep('상위 기사 선별', 'completed', {
        message: `${selectedArticles.length}개 기사 선별 완료`,
        count: selectedArticles.length,
        titles: selectedArticles.map(a => a.title.substring(0, 50) + '...')
      });
      
      return selectedArticles;
      
    } catch (error) {
      this.logStep('상위 기사 선별', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // 3단계: 각 기사별로 글 작성
  async generateArticles(selectedArticles) {
    this.logStep('글 작성', 'started');
    
    try {
      await this.articleWriter.loadStyleTemplate();
      
      const generatedArticles = [];
      let successCount = 0;
      let totalTokensUsed = 0;
      
      for (let i = 0; i < selectedArticles.length; i++) {
        const article = selectedArticles[i];
        
        console.log(`   📝 글 작성 진행: ${i + 1}/${selectedArticles.length} - ${article.title.substring(0, 30)}...`);
        
        try {
          const generatedArticle = await this.articleWriter.generateArticleWithClaude(
            article,
            this.articleWriter.styleTemplate
          );
          
          generatedArticles.push(generatedArticle);
          successCount++;
          
          // 토큰 사용량 추정 (실제 API 응답에서 가져오는 것이 더 정확)
          const estimatedTokens = this.estimateTokenUsage(article, generatedArticle);
          totalTokensUsed += estimatedTokens;
          
          // API 호출 간격
          if (i < selectedArticles.length - 1) {
            await this.delay(1000);
          }
          
        } catch (error) {
          console.warn(`   ⚠️  글 작성 실패: ${article.title.substring(0, 30)}... - ${error.message}`);
          
          // 실패한 경우 대체 글 생성
          const fallbackArticle = this.articleWriter.generateFallbackArticle(article);
          generatedArticles.push(fallbackArticle);
        }
      }
      
      this.workflowData.stats.tokensUsed = totalTokensUsed;
      this.workflowData.stats.estimatedCost = this.calculateCost(totalTokensUsed);
      this.workflowData.stats.successRate = (successCount / selectedArticles.length) * 100;
      
      this.logStep('글 작성', 'completed', {
        message: `${generatedArticles.length}개 글 작성 완료 (성공: ${successCount}개)`,
        count: generatedArticles.length,
        successCount,
        tokensUsed: totalTokensUsed,
        estimatedCost: this.workflowData.stats.estimatedCost
      });
      
      this.workflowData.results.articles = generatedArticles;
      return generatedArticles;
      
    } catch (error) {
      this.logStep('글 작성', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // 4단계: 품질 검증 실행
  async performQualityCheck(generatedArticles) {
    this.logStep('품질 검증', 'started');
    
    try {
      await this.qualityChecker.loadStyleTemplate();
      
      const qualityReports = [];
      
      for (let i = 0; i < generatedArticles.length; i++) {
        const article = generatedArticles[i];
        
        console.log(`   🔍 품질 검증 진행: ${i + 1}/${generatedArticles.length} - ${article.title.substring(0, 30)}...`);
        
        const report = await this.qualityChecker.generateQualityReport(article);
        qualityReports.push(report);
      }
      
      const passedCount = qualityReports.filter(r => r.status === 'PASSED').length;
      const avgScore = Math.round(
        qualityReports.reduce((sum, r) => sum + r.scores.total, 0) / qualityReports.length
      );
      
      this.logStep('품질 검증', 'completed', {
        message: `품질 검증 완료 (통과: ${passedCount}개, 평균: ${avgScore}점)`,
        count: qualityReports.length,
        passedCount,
        avgScore
      });
      
      this.workflowData.results.qualityReports = qualityReports;
      return qualityReports;
      
    } catch (error) {
      this.logStep('품질 검증', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // 5단계: 최고 점수 글 선택
  async selectBestArticle(qualityReports) {
    this.logStep('최적 글 선택', 'started');
    
    try {
      let selectedReport;
      
      if (this.mode === 'auto') {
        // 자동 모드: 최고 점수 글 선택
        selectedReport = qualityReports.reduce((best, current) => 
          current.scores.total > best.scores.total ? current : best
        );
      } else if (this.mode === 'selection') {
        // 선택 모드: 모든 글을 사용자에게 제시 (여기서는 최고 점수를 기본 선택)
        selectedReport = qualityReports.reduce((best, current) => 
          current.scores.total > best.scores.total ? current : best
        );
      } else {
        // 커스텀 모드: 첫 번째 글 선택
        selectedReport = qualityReports[0];
      }
      
      this.logStep('최적 글 선택', 'completed', {
        message: `최적 글 선택 완료 (점수: ${selectedReport.scores.total}점)`,
        selectedTitle: selectedReport.article.title,
        score: selectedReport.scores.total,
        status: selectedReport.status
      });
      
      this.workflowData.results.selectedArticle = selectedReport;
      return selectedReport;
      
    } catch (error) {
      this.logStep('최적 글 선택', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // 6단계: 사용자 검토용 포맷 정리
  async prepareReviewFormats(selectedReport, allReports) {
    this.logStep('검토용 포맷 준비', 'started');
    
    try {
      const outputDir = path.join(__dirname, '../../data/outputs');
      await fs.ensureDir(outputDir);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
      const dateStr = timestamp[0];
      const timeStr = timestamp[1].split('.')[0];
      
      const outputs = {};
      
      // 1. HTML 미리보기 (브런치 형태)
      outputs.html = await this.generateHTMLPreview(selectedReport);
      const htmlPath = path.join(outputDir, `preview-${dateStr}-${timeStr}.html`);
      await fs.writeFile(htmlPath, outputs.html, 'utf8');
      
      // 2. 마크다운 파일
      outputs.markdown = this.generateMarkdown(selectedReport);
      const mdPath = path.join(outputDir, `article-${dateStr}-${timeStr}.md`);
      await fs.writeFile(mdPath, outputs.markdown, 'utf8');
      
      // 3. 일반 텍스트
      outputs.text = this.generatePlainText(selectedReport);
      const txtPath = path.join(outputDir, `article-${dateStr}-${timeStr}.txt`);
      await fs.writeFile(txtPath, outputs.text, 'utf8');
      
      // 4. JSON 데이터
      outputs.json = this.generateJSONOutput(selectedReport, allReports);
      const jsonPath = path.join(outputDir, `data-${dateStr}-${timeStr}.json`);
      await fs.writeJson(jsonPath, outputs.json, { spaces: 2 });
      
      this.logStep('검토용 포맷 준비', 'completed', {
        message: '모든 출력 포맷 생성 완료',
        formats: ['HTML', 'Markdown', 'Text', 'JSON'],
        paths: [htmlPath, mdPath, txtPath, jsonPath]
      });
      
      this.workflowData.results.outputs = {
        html: htmlPath,
        markdown: mdPath,
        text: txtPath,
        json: jsonPath,
        content: outputs
      };
      
      return outputs;
      
    } catch (error) {
      this.logStep('검토용 포맷 준비', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // 7단계: 대시보드 표시용 데이터 준비
  async prepareDashboardData() {
    this.logStep('대시보드 데이터 준비', 'started');
    
    try {
      const dashboardDir = path.join(__dirname, '../../data/dashboard');
      await fs.ensureDir(dashboardDir);
      
      const dashboardData = {
        workflow: {
          id: this.generateWorkflowId(),
          mode: this.mode,
          startTime: this.workflowData.startTime,
          endTime: new Date(),
          duration: new Date() - this.workflowData.startTime,
          status: 'completed'
        },
        summary: {
          articlesGenerated: this.workflowData.results.articles.length,
          qualityChecksPassed: this.workflowData.results.qualityReports.filter(r => r.status === 'PASSED').length,
          selectedArticleScore: this.workflowData.results.selectedArticle?.scores.total || 0,
          tokensUsed: this.workflowData.stats.tokensUsed,
          estimatedCost: this.workflowData.stats.estimatedCost,
          successRate: this.workflowData.stats.successRate
        },
        selectedArticle: this.workflowData.results.selectedArticle,
        allArticles: this.workflowData.results.qualityReports.map(report => ({
          title: report.article.title,
          score: report.scores.total,
          status: report.status,
          wordCount: report.article.wordCount,
          hashtags: report.article.hashtags
        })),
        steps: this.workflowData.steps,
        outputs: this.workflowData.results.outputs
      };
      
      // 대시보드 데이터 저장
      const dashboardPath = path.join(dashboardDir, 'latest-workflow.json');
      await fs.writeJson(dashboardPath, dashboardData, { spaces: 2 });
      
      // 히스토리에도 저장
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
      const historyPath = path.join(dashboardDir, `workflow-${timestamp[0]}-${timestamp[1].split('.')[0]}.json`);
      await fs.writeJson(historyPath, dashboardData, { spaces: 2 });
      
      this.logStep('대시보드 데이터 준비', 'completed', {
        message: '대시보드 데이터 준비 완료',
        dataPath: dashboardPath,
        historyPath
      });
      
      return dashboardData;
      
    } catch (error) {
      this.logStep('대시보드 데이터 준비', 'failed', {
        message: error.message,
        error: error.stack
      });
      throw error;
    }
  }

  // HTML 미리보기 생성
  async generateHTMLPreview(selectedReport) {
    const article = this.workflowData.results.articles.find(a => 
      a.title === selectedReport.article.title
    );
    
    if (!article) {
      throw new Error('선택된 기사의 전체 내용을 찾을 수 없습니다.');
    }
    
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title}</title>
    <style>
        body {
            font-family: 'Apple SD Gothic Neo', '나눔고딕', 'Nanum Gothic', sans-serif;
            line-height: 1.6;
            max-width: 680px;
            margin: 0 auto;
            padding: 20px;
            background-color: #fafafa;
        }
        .article-container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .article-title {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #333;
            line-height: 1.4;
        }
        .article-meta {
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }
        .article-content {
            font-size: 16px;
            color: #333;
            line-height: 1.8;
        }
        .article-content p {
            margin-bottom: 20px;
        }
        .hashtags {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .hashtag {
            display: inline-block;
            background: #f0f0f0;
            color: #666;
            padding: 4px 8px;
            margin: 0 4px 8px 0;
            border-radius: 12px;
            font-size: 14px;
        }
        .quality-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .quality-passed {
            background: #e8f5e8;
            color: #2d5a2d;
        }
        .quality-needs-improvement {
            background: #fff3cd;
            color: #856404;
        }
        .original-source {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            margin-top: 30px;
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="article-container">
        <div class="quality-badge ${selectedReport.status === 'PASSED' ? 'quality-passed' : 'quality-needs-improvement'}">
            ${selectedReport.status === 'PASSED' ? '✅ 발행 준비 완료' : '⚠️ 개선 필요'} (${selectedReport.scores.total}점)
        </div>
        
        <h1 class="article-title">${article.title}</h1>
        
        <div class="article-meta">
            작성일: ${new Date(article.generatedAt).toLocaleDateString('ko-KR')} | 
            글자 수: ${article.wordCount}자 | 
            문단 수: ${article.paragraphCount}개
        </div>
        
        <div class="article-content">
            ${article.body.split('\n\n').map(paragraph => 
              paragraph.trim() ? `<p>${paragraph.trim()}</p>` : ''
            ).join('')}
        </div>
        
        <div class="hashtags">
            ${article.hashtags.map(tag => `<span class="hashtag">#${tag}</span>`).join('')}
        </div>
        
        <div class="original-source">
            <strong>원본 기사:</strong><br>
            ${article.originalArticle.title}<br>
            <small>${article.originalArticle.source} | ${new Date(article.originalArticle.publishDate).toLocaleDateString('ko-KR')}</small>
        </div>
    </div>
</body>
</html>`;
    
    return html;
  }

  // 마크다운 생성
  generateMarkdown(selectedReport) {
    const article = this.workflowData.results.articles.find(a => 
      a.title === selectedReport.article.title
    );
    
    const markdown = `# ${article.title}

> **품질 점수:** ${selectedReport.scores.total}점 (${selectedReport.status === 'PASSED' ? '발행 준비 완료' : '개선 필요'})  
> **작성일:** ${new Date(article.generatedAt).toLocaleDateString('ko-KR')}  
> **글자 수:** ${article.wordCount}자 | **문단 수:** ${article.paragraphCount}개

---

${article.body}

---

**해시태그:** ${article.hashtags.map(tag => `#${tag}`).join(' ')}

---

### 원본 기사 정보
- **제목:** ${article.originalArticle.title}
- **출처:** ${article.originalArticle.source}
- **발행일:** ${new Date(article.originalArticle.publishDate).toLocaleDateString('ko-KR')}
- **URL:** ${article.originalArticle.url}

### 품질 평가 세부사항
- **브런치 스타일:** ${selectedReport.scores.brunchStyle}점
- **콘텐츠 품질:** ${selectedReport.scores.contentQuality}점
- **가독성:** ${selectedReport.scores.readability}점
- **SEO 최적화:** ${selectedReport.scores.seoOptimization}점`;

    return markdown;
  }

  // 일반 텍스트 생성
  generatePlainText(selectedReport) {
    const article = this.workflowData.results.articles.find(a => 
      a.title === selectedReport.article.title
    );
    
    const text = `${article.title}

${article.body}

해시태그: ${article.hashtags.map(tag => `#${tag}`).join(' ')}

---
원본 기사: ${article.originalArticle.title}
출처: ${article.originalArticle.source}
품질 점수: ${selectedReport.scores.total}점`;

    return text;
  }

  // JSON 출력 생성
  generateJSONOutput(selectedReport, allReports) {
    return {
      selectedArticle: {
        ...this.workflowData.results.articles.find(a => 
          a.title === selectedReport.article.title
        ),
        qualityReport: selectedReport
      },
      alternatives: allReports.filter(r => r !== selectedReport).map(report => ({
        ...this.workflowData.results.articles.find(a => 
          a.title === report.article.title
        ),
        qualityReport: report
      })),
      workflow: {
        mode: this.mode,
        startTime: this.workflowData.startTime,
        endTime: new Date(),
        steps: this.workflowData.steps,
        stats: this.workflowData.stats
      }
    };
  }

  // 토큰 사용량 추정
  estimateTokenUsage(inputArticle, outputArticle) {
    // 대략적인 토큰 계산 (한국어는 영어보다 토큰이 많이 사용됨)
    const inputText = inputArticle.title + ' ' + inputArticle.summary;
    const outputText = outputArticle.title + ' ' + outputArticle.body;
    
    const inputTokens = Math.ceil(inputText.length / 3); // 한국어 평균 3자 = 1토큰
    const outputTokens = Math.ceil(outputText.length / 3);
    
    return { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens };
  }

  // 비용 계산
  calculateCost(tokenUsage) {
    if (typeof tokenUsage === 'number') {
      // 총 토큰 수인 경우 (입력:출력 = 1:2 비율로 가정)
      const inputTokens = Math.floor(tokenUsage / 3);
      const outputTokens = tokenUsage - inputTokens;
      return (inputTokens * this.tokenCosts.input) + (outputTokens * this.tokenCosts.output);
    } else {
      // 객체인 경우
      return (tokenUsage.input * this.tokenCosts.input) + (tokenUsage.output * this.tokenCosts.output);
    }
  }

  // 워크플로우 ID 생성
  generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 딜레이 유틸리티
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 전체 워크플로우 실행
  async execute() {
    try {
      console.log('🚀 콘텐츠 생성 워크플로우 시작');
      console.log(`📋 실행 모드: ${this.mode.toUpperCase()}`);
      console.log(`🎯 최대 기사 수: ${this.maxArticles}개`);
      console.log('');
      
      // 1단계: 기사 목록 로딩
      const articles = await this.loadTodaysArticles();
      
      // 2단계: 상위 기사 선별
      const selectedArticles = await this.selectTopArticles(articles);
      
      // 3단계: 글 작성
      const generatedArticles = await this.generateArticles(selectedArticles);
      
      // 4단계: 품질 검증
      const qualityReports = await this.performQualityCheck(generatedArticles);
      
      // 5단계: 최적 글 선택
      const selectedReport = await this.selectBestArticle(qualityReports);
      
      // 6단계: 검토용 포맷 준비
      const outputs = await this.prepareReviewFormats(selectedReport, qualityReports);
      
      // 7단계: 대시보드 데이터 준비
      const dashboardData = await this.prepareDashboardData();
      
      // 최종 결과 출력
      this.printFinalSummary();
      
      return {
        success: true,
        selectedArticle: selectedReport,
        alternatives: qualityReports.filter(r => r !== selectedReport),
        outputs,
        dashboardData,
        stats: this.workflowData.stats
      };
      
    } catch (error) {
      console.error('❌ 워크플로우 실행 실패:', error.message);
      
      // 실패 로깅
      this.logStep('워크플로우 실행', 'failed', {
        message: error.message,
        error: error.stack
      });
      
      // 부분 결과라도 저장
      await this.savePartialResults();
      
      throw error;
    }
  }

  // 최종 요약 출력
  printFinalSummary() {
    const duration = new Date() - this.workflowData.startTime;
    const selectedArticle = this.workflowData.results.selectedArticle;
    
    console.log('\n🎉 ===== 콘텐츠 생성 워크플로우 완료 =====');
    console.log(`⏱️  총 소요시간: ${Math.round(duration / 1000)}초`);
    console.log(`📊 성공률: ${this.workflowData.stats.successRate.toFixed(1)}%`);
    console.log(`💰 예상 비용: $${this.workflowData.stats.estimatedCost.toFixed(4)}`);
    console.log('');
    
    if (selectedArticle) {
      console.log('📝 선택된 글 정보:');
      console.log(`   제목: ${selectedArticle.article.title}`);
      console.log(`   점수: ${selectedArticle.scores.total}점 (${selectedArticle.status})`);
      console.log(`   글자수: ${selectedArticle.article.wordCount}자`);
      console.log(`   해시태그: #${selectedArticle.article.hashtags.join(' #')}`);
      console.log('');
      
      const outputs = this.workflowData.results.outputs;
      if (outputs) {
        console.log('📁 생성된 파일:');
        console.log(`   HTML 미리보기: ${outputs.html}`);
        console.log(`   마크다운: ${outputs.markdown}`);
        console.log(`   텍스트: ${outputs.text}`);
        console.log(`   JSON 데이터: ${outputs.json}`);
      }
    }
    
    console.log('\n🎯 다음 단계: Express 서버에서 결과를 확인하세요!');
    console.log('===============================================\n');
  }

  // 부분 결과 저장 (실패 시)
  async savePartialResults() {
    try {
      const errorDir = path.join(__dirname, '../../data/errors');
      await fs.ensureDir(errorDir);
      
      const errorData = {
        timestamp: new Date().toISOString(),
        mode: this.mode,
        steps: this.workflowData.steps,
        partialResults: this.workflowData.results,
        stats: this.workflowData.stats
      };
      
      const errorPath = path.join(errorDir, `workflow-error-${Date.now()}.json`);
      await fs.writeJson(errorPath, errorData, { spaces: 2 });
      
      console.log(`🔍 부분 결과 저장됨: ${errorPath}`);
      
    } catch (saveError) {
      console.error('부분 결과 저장 실패:', saveError.message);
    }
  }

  // 정적 메서드: 워크플로우 실행
  static async run(options = {}) {
    const workflow = new ContentCreationWorkflow(options);
    return await workflow.execute();
  }
}

module.exports = ContentCreationWorkflow;

// 직접 실행 시
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // 실행 옵션 파싱
  const options = {};
  
  if (args.includes('--mode')) {
    const modeIndex = args.indexOf('--mode');
    options.mode = args[modeIndex + 1] || 'auto';
  }
  
  if (args.includes('--max-articles')) {
    const maxIndex = args.indexOf('--max-articles');
    options.maxArticles = parseInt(args[maxIndex + 1]) || 3;
  }
  
  if (args.includes('--target')) {
    const targetIndex = args.indexOf('--target');
    options.targetArticleId = args[targetIndex + 1];
    options.mode = 'custom';
  }
  
  // 도움말 출력
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🤖 HR 콘텐츠 자동 생성 워크플로우

사용법:
  node src/workflows/contentCreation.js [옵션]

옵션:
  --mode <auto|selection|custom>  실행 모드 (기본: auto)
  --max-articles <숫자>           최대 기사 수 (기본: 3)
  --target <기사URL>              특정 기사 지정 (custom 모드)
  --help, -h                      도움말 표시

예시:
  node src/workflows/contentCreation.js --mode auto
  node src/workflows/contentCreation.js --mode selection --max-articles 5
  node src/workflows/contentCreation.js --target "https://example.com/article"
`);
    process.exit(0);
  }
  
  // 환경변수 확인
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }
  
  // 워크플로우 실행
  ContentCreationWorkflow.run(options)
    .then(result => {
      console.log('✅ 워크플로우 실행 완료!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 워크플로우 실행 실패:', error.message);
      process.exit(1);
    });
}