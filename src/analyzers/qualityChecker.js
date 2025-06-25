const fs = require('fs-extra');
const path = require('path');
const natural = require('natural');

class QualityChecker {
  constructor() {
    this.styleTemplate = null;
    this.generatedArticles = [];
    this.qualityReports = [];
    
    // 품질 평가 가중치
    this.weights = {
      brunchStyle: 0.3,      // 30% - 브런치 스타일 일치도
      contentQuality: 0.3,   // 30% - 콘텐츠 품질
      readability: 0.25,     // 25% - 독자 친화성
      seoOptimization: 0.15  // 15% - SEO 최적화
    };
    
    // 통과 기준
    this.passingScore = 80;
    
    // 브런치 스타일 기준값
    this.brunchStandards = {
      titleLength: { min: 15, max: 25, optimal: 20 },
      paragraphCount: { min: 4, max: 8, optimal: 5 },
      sentenceLength: { min: 15, max: 35, optimal: 25 },
      wordCount: { min: 800, max: 1500, optimal: 1000 }
    };
    
    // 한국어 불용어 리스트
    this.stopWords = new Set([
      '이', '그', '저', '것', '들', '을', '를', '이', '가', '에', '서', '의', '와', '과',
      '는', '은', '도', '만', '까지', '부터', '조차', '마저', '하지만', '그러나', '따라서',
      '그래서', '또한', '그리고', '그런데', '있다', '없다', '되다', '하다', '이다', '아니다'
    ]);
    
    // SEO 키워드 카테고리
    this.seoKeywords = {
      hr: ['HR', '인사', '채용', '면접', '조직문화', '리더십', '성과관리'],
      work: ['직장', '업무', '근무', '회사', '직원', '팀', '조직', '관리'],
      trend: ['최신', '트렌드', '변화', '혁신', '디지털', '미래', '발전'],
      practical: ['방법', '팁', '노하우', '가이드', '전략', '해결', '개선']
    };
  }

  // 스타일 템플릿 로드
  async loadStyleTemplate() {
    try {
      const templatePath = path.join(__dirname, '../../data/analysis/style-template.json');
      
      if (!await fs.pathExists(templatePath)) {
        throw new Error('스타일 템플릿을 찾을 수 없습니다.');
      }
      
      this.styleTemplate = await fs.readJson(templatePath);
      console.log('스타일 템플릿 로딩 완료');
      
    } catch (error) {
      console.error('스타일 템플릿 로딩 실패:', error.message);
      throw error;
    }
  }

  // 생성된 기사 로드
  async loadGeneratedArticles() {
    try {
      const draftsPath = path.join(__dirname, '../../data/drafts/articles-latest.json');
      
      if (!await fs.pathExists(draftsPath)) {
        throw new Error('생성된 기사를 찾을 수 없습니다.');
      }
      
      const data = await fs.readJson(draftsPath);
      this.generatedArticles = data.articles || [];
      
      console.log(`${this.generatedArticles.length}개 기사 로딩 완료`);
      
    } catch (error) {
      console.error('생성된 기사 로딩 실패:', error.message);
      throw error;
    }
  }

  // 1. 브런치 스타일 일치도 검사 (0-100점)
  checkBrunchStyleCompliance(article) {
    const scores = {
      titlePattern: this.checkTitlePattern(article.title),
      toneAndManner: this.checkToneAndManner(article.body),
      structuralSimilarity: this.checkStructuralSimilarity(article)
    };
    
    const finalScore = (
      scores.titlePattern * 0.4 +
      scores.toneAndManner * 0.4 +
      scores.structuralSimilarity * 0.2
    );
    
    return {
      score: Math.round(finalScore),
      details: scores,
      feedback: this.generateStyleFeedback(scores)
    };
  }

  // 제목 패턴 검사
  checkTitlePattern(title) {
    let score = 50; // 기본 점수
    
    // 길이 검사
    const length = title.length;
    if (length >= this.brunchStandards.titleLength.min && 
        length <= this.brunchStandards.titleLength.max) {
      score += 25;
    } else {
      score -= Math.abs(length - this.brunchStandards.titleLength.optimal) * 2;
    }
    
    // 스타일 템플릿과 유사성 검사
    const templates = this.styleTemplate?.templates?.title || [];
    const similarity = this.findBestTemplateMatch(title, templates);
    score += similarity * 25;
    
    return Math.max(0, Math.min(100, score));
  }

  // 톤앤매너 검사
  checkToneAndManner(body) {
    let score = 50;
    
    // 친근한 표현 검사
    const friendlyExpressions = ['요즘', '최근에', '개인적으로', '사실', '정말', '아마도'];
    const friendlyCount = friendlyExpressions.reduce((count, expr) => 
      count + (body.includes(expr) ? 1 : 0), 0);
    score += Math.min(friendlyCount * 5, 20);
    
    // 경험담/개인적 표현 검사
    const personalExpressions = ['경험', '생각', '느낌', '개인적', '사실', '실제로'];
    const personalCount = personalExpressions.reduce((count, expr) => 
      count + (body.includes(expr) ? 1 : 0), 0);
    score += Math.min(personalCount * 3, 15);
    
    // 감정 표현 검사
    const emotionalWords = ['놀라운', '흥미로운', '중요한', '특별한', '인상적인'];
    const emotionalCount = emotionalWords.reduce((count, word) => 
      count + (body.includes(word) ? 1 : 0), 0);
    score += Math.min(emotionalCount * 3, 15);
    
    return Math.max(0, Math.min(100, score));
  }

  // 구조적 유사성 검사
  checkStructuralSimilarity(article) {
    let score = 50;
    
    // 문단 수 검사
    const paragraphCount = article.paragraphCount || article.body.split('\n\n').length;
    if (paragraphCount >= this.brunchStandards.paragraphCount.min &&
        paragraphCount <= this.brunchStandards.paragraphCount.max) {
      score += 25;
    } else {
      score -= Math.abs(paragraphCount - this.brunchStandards.paragraphCount.optimal) * 3;
    }
    
    // 글자 수 검사
    const wordCount = article.wordCount || article.body.replace(/\s/g, '').length;
    if (wordCount >= this.brunchStandards.wordCount.min &&
        wordCount <= this.brunchStandards.wordCount.max) {
      score += 25;
    } else {
      const deviation = Math.abs(wordCount - this.brunchStandards.wordCount.optimal);
      score -= Math.min(deviation / 50, 25);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // 2. 콘텐츠 품질 검사 (0-100점)
  checkContentQuality(article) {
    const scores = {
      informationAccuracy: this.checkInformationAccuracy(article),
      logicalFlow: this.checkLogicalFlow(article.body),
      originality: this.checkOriginality(article)
    };
    
    const finalScore = (
      scores.informationAccuracy * 0.4 +
      scores.logicalFlow * 0.4 +
      scores.originality * 0.2
    );
    
    return {
      score: Math.round(finalScore),
      details: scores,
      feedback: this.generateContentFeedback(scores)
    };
  }

  // 정보 정확성 검사
  checkInformationAccuracy(article) {
    let score = 70; // 기본 점수 (AI 생성 글의 특성상)
    
    // 원본 기사와의 일치도 검사
    const originalTitle = article.originalArticle?.title || '';
    const similarity = this.calculateTextSimilarity(article.title, originalTitle);
    score += similarity * 20;
    
    // 구체적 정보 포함 여부
    const specificInfo = /\d+%|\d+개|\d+명|\d+년|\d+월/g;
    const matches = article.body.match(specificInfo) || [];
    score += Math.min(matches.length * 2, 10);
    
    return Math.max(0, Math.min(100, score));
  }

  // 논리적 흐름 검사
  checkLogicalFlow(body) {
    let score = 60;
    
    // 연결어 사용 검사
    const connectors = ['그러나', '하지만', '따라서', '그래서', '또한', '그리고', '반면에'];
    const connectorCount = connectors.reduce((count, connector) => 
      count + (body.includes(connector) ? 1 : 0), 0);
    score += Math.min(connectorCount * 5, 20);
    
    // 문단 간 연결성 검사
    const paragraphs = body.split('\n\n').filter(p => p.trim());
    if (paragraphs.length >= 3) {
      score += 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // 독창성 검사
  checkOriginality(article) {
    let score = 75; // 기본 점수
    
    // 개인적 경험/의견 포함 여부
    const personalElements = ['경험', '생각', '개인적으로', '느낌', '의견'];
    const personalCount = personalElements.reduce((count, element) => 
      count + (article.body.includes(element) ? 1 : 0), 0);
    score += Math.min(personalCount * 5, 25);
    
    return Math.max(0, Math.min(100, score));
  }

  // 3. 독자 친화성 검사 (0-100점)
  checkReadability(article) {
    const scores = {
      readabilityScore: this.calculateReadabilityScore(article.body),
      clarity: this.checkClarity(article.body),
      practicalAdvice: this.checkPracticalAdvice(article.body)
    };
    
    const finalScore = (
      scores.readabilityScore * 0.4 +
      scores.clarity * 0.3 +
      scores.practicalAdvice * 0.3
    );
    
    return {
      score: Math.round(finalScore),
      details: scores,
      feedback: this.generateReadabilityFeedback(scores)
    };
  }

  // 가독성 점수 계산
  calculateReadabilityScore(body) {
    const sentences = body.split(/[.!?]/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) return 0;
    
    const avgSentenceLength = sentences.reduce((sum, sentence) => 
      sum + sentence.trim().length, 0) / sentences.length;
    
    let score = 50;
    
    // 적정 문장 길이 검사
    if (avgSentenceLength >= this.brunchStandards.sentenceLength.min &&
        avgSentenceLength <= this.brunchStandards.sentenceLength.max) {
      score += 30;
    } else {
      const deviation = Math.abs(avgSentenceLength - this.brunchStandards.sentenceLength.optimal);
      score -= deviation;
    }
    
    // 문장 길이 일관성 검사
    const lengthVariance = this.calculateVariance(sentences.map(s => s.length));
    if (lengthVariance < 200) {
      score += 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // 명확성 검사
  checkClarity(body) {
    let score = 60;
    
    // 쉬운 단어 사용 비율
    const words = body.split(/\s+/).filter(word => word.length > 1);
    const easyWords = words.filter(word => word.length <= 4);
    const easyWordRatio = easyWords.length / words.length;
    score += easyWordRatio * 40;
    
    return Math.max(0, Math.min(100, score));
  }

  // 실용적 조언 검사
  checkPracticalAdvice(body) {
    let score = 50;
    
    // 실용적 표현 검사
    const practicalExpressions = [
      '방법', '팁', '노하우', '가이드', '해결', '개선', '실행', '적용',
      '시작', '준비', '계획', '전략', '실천', '활용'
    ];
    
    const practicalCount = practicalExpressions.reduce((count, expr) => 
      count + (body.includes(expr) ? 1 : 0), 0);
    score += Math.min(practicalCount * 3, 30);
    
    // 구체적 예시 제공
    const examplePatterns = ['예를 들어', '예시', '사례', '경우'];
    const exampleCount = examplePatterns.reduce((count, pattern) => 
      count + (body.includes(pattern) ? 1 : 0), 0);
    score += Math.min(exampleCount * 5, 20);
    
    return Math.max(0, Math.min(100, score));
  }

  // 4. SEO 최적화 검사 (0-100점)
  checkSEOOptimization(article) {
    const scores = {
      keywordDensity: this.checkKeywordDensity(article),
      titleOptimization: this.checkTitleSEO(article.title),
      hashtagRelevance: this.checkHashtagRelevance(article.hashtags, article.body)
    };
    
    const finalScore = (
      scores.keywordDensity * 0.4 +
      scores.titleOptimization * 0.3 +
      scores.hashtagRelevance * 0.3
    );
    
    return {
      score: Math.round(finalScore),
      details: scores,
      feedback: this.generateSEOFeedback(scores)
    };
  }

  // 키워드 밀도 검사
  checkKeywordDensity(article) {
    let score = 50;
    const text = (article.title + ' ' + article.body).toLowerCase();
    const words = text.split(/\s+/).length;
    
    let totalKeywordCount = 0;
    
    // 카테고리별 키워드 검사
    Object.entries(this.seoKeywords).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        const regex = new RegExp(keyword.toLowerCase(), 'g');
        const matches = text.match(regex) || [];
        totalKeywordCount += matches.length;
      });
    });
    
    const keywordDensity = (totalKeywordCount / words) * 100;
    
    // 적정 키워드 밀도 (1-3%)
    if (keywordDensity >= 1 && keywordDensity <= 3) {
      score += 40;
    } else if (keywordDensity > 0) {
      score += 20;
    }
    
    // 키워드 다양성 보너스
    const uniqueKeywords = new Set();
    Object.values(this.seoKeywords).flat().forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        uniqueKeywords.add(keyword);
      }
    });
    
    score += Math.min(uniqueKeywords.size * 2, 10);
    
    return Math.max(0, Math.min(100, score));
  }

  // 제목 SEO 최적화 검사
  checkTitleSEO(title) {
    let score = 50;
    
    // 주요 키워드 포함 여부
    const titleLower = title.toLowerCase();
    let keywordCount = 0;
    
    Object.values(this.seoKeywords).flat().forEach(keyword => {
      if (titleLower.includes(keyword.toLowerCase())) {
        keywordCount++;
      }
    });
    
    score += Math.min(keywordCount * 15, 30);
    
    // 숫자 포함 여부 (클릭률 향상)
    if (/\d+/.test(title)) {
      score += 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // 해시태그 관련성 검사
  checkHashtagRelevance(hashtags, body) {
    if (!hashtags || hashtags.length === 0) return 0;
    
    let score = 30; // 기본 점수
    const bodyLower = body.toLowerCase();
    
    // 해시태그와 본문 내용 일치도
    let relevantTags = 0;
    hashtags.forEach(tag => {
      if (bodyLower.includes(tag.toLowerCase())) {
        relevantTags++;
      }
    });
    
    const relevanceRatio = relevantTags / hashtags.length;
    score += relevanceRatio * 40;
    
    // 적정 해시태그 개수 (3-5개)
    if (hashtags.length >= 3 && hashtags.length <= 5) {
      score += 30;
    } else {
      score += Math.max(0, 30 - Math.abs(hashtags.length - 4) * 5);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // 전체 품질 검사 실행
  async performQualityCheck() {
    try {
      console.log('=== 글 품질 검증 시작 ===');
      
      // 데이터 로드
      await this.loadStyleTemplate();
      await this.loadGeneratedArticles();
      
      if (this.generatedArticles.length === 0) {
        throw new Error('검증할 기사가 없습니다.');
      }
      
      // 각 기사별 품질 검사
      console.log(`${this.generatedArticles.length}개 기사 품질 검사 중...`);
      
      for (let i = 0; i < this.generatedArticles.length; i++) {
        const article = this.generatedArticles[i];
        
        console.log(`진행률: ${i + 1}/${this.generatedArticles.length} (${((i + 1) / this.generatedArticles.length * 100).toFixed(1)}%)`);
        
        const qualityReport = await this.generateQualityReport(article);
        this.qualityReports.push(qualityReport);
      }
      
      // 결과 저장
      await this.saveQualityReports();
      
      // 요약 출력
      this.printQualitySummary();
      
      return this.qualityReports;
      
    } catch (error) {
      console.error('품질 검사 실패:', error);
      throw error;
    }
  }

  // 개별 기사 품질 보고서 생성
  async generateQualityReport(article) {
    const checks = {
      brunchStyle: this.checkBrunchStyleCompliance(article),
      contentQuality: this.checkContentQuality(article),
      readability: this.checkReadability(article),
      seoOptimization: this.checkSEOOptimization(article)
    };
    
    // 가중 평균 계산
    const totalScore = (
      checks.brunchStyle.score * this.weights.brunchStyle +
      checks.contentQuality.score * this.weights.contentQuality +
      checks.readability.score * this.weights.readability +
      checks.seoOptimization.score * this.weights.seoOptimization
    );
    
    const isPassed = totalScore >= this.passingScore;
    const recommendations = this.generateRecommendations(checks, totalScore);
    
    return {
      article: {
        title: article.title,
        wordCount: article.wordCount,
        paragraphCount: article.paragraphCount,
        hashtags: article.hashtags
      },
      scores: {
        total: Math.round(totalScore),
        brunchStyle: checks.brunchStyle.score,
        contentQuality: checks.contentQuality.score,
        readability: checks.readability.score,
        seoOptimization: checks.seoOptimization.score
      },
      details: checks,
      status: isPassed ? 'PASSED' : 'NEEDS_IMPROVEMENT',
      recommendations,
      checkedAt: new Date().toISOString()
    };
  }

  // 개선 제안 생성
  generateRecommendations(checks, totalScore) {
    const recommendations = {
      priority: [],
      improvements: [],
      suggestions: []
    };
    
    // 우선순위 개선 사항 (60점 미만)
    if (checks.brunchStyle.score < 60) {
      recommendations.priority.push({
        category: '브런치 스타일',
        issue: '브런치 스타일 일치도가 낮습니다.',
        solution: '개인적 경험담을 더 많이 포함하고, 친근한 어조로 작성하세요.'
      });
    }
    
    if (checks.contentQuality.score < 60) {
      recommendations.priority.push({
        category: '콘텐츠 품질',
        issue: '콘텐츠 품질이 기준에 미달합니다.',
        solution: '논리적 구성을 강화하고 구체적인 사례나 데이터를 추가하세요.'
      });
    }
    
    // 일반 개선 사항 (60-75점)
    if (checks.readability.score >= 60 && checks.readability.score < 75) {
      recommendations.improvements.push({
        category: '가독성',
        issue: '가독성을 더 높일 수 있습니다.',
        solution: '문장을 더 간결하게 만들고 실용적인 팁을 추가하세요.'
      });
    }
    
    if (checks.seoOptimization.score >= 60 && checks.seoOptimization.score < 75) {
      recommendations.improvements.push({
        category: 'SEO',
        issue: 'SEO 최적화를 개선할 수 있습니다.',
        solution: '관련 키워드를 자연스럽게 더 포함하고 해시태그를 최적화하세요.'
      });
    }
    
    // 추가 제안 사항
    if (totalScore >= this.passingScore) {
      recommendations.suggestions.push({
        category: '추가 개선',
        suggestion: '이미 발행 준비가 완료된 글입니다. 시각적 요소나 인터랙티브 요소를 추가하면 더욱 좋습니다.'
      });
    }
    
    return recommendations;
  }

  // 품질 보고서 저장
  async saveQualityReports() {
    try {
      const reportsDir = path.join(__dirname, '../../data/quality');
      await fs.ensureDir(reportsDir);
      
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
      const filename = `quality-report-${timestamp[0]}-${timestamp[1].split('.')[0]}.json`;
      const filepath = path.join(reportsDir, filename);
      
      const saveData = {
        metadata: {
          checkedAt: now.toISOString(),
          totalArticles: this.qualityReports.length,
          passedCount: this.qualityReports.filter(r => r.status === 'PASSED').length,
          failedCount: this.qualityReports.filter(r => r.status === 'NEEDS_IMPROVEMENT').length,
          averageScore: Math.round(
            this.qualityReports.reduce((sum, r) => sum + r.scores.total, 0) / this.qualityReports.length
          ),
          passingScore: this.passingScore,
          weights: this.weights
        },
        reports: this.qualityReports
      };
      
      await fs.writeJson(filepath, saveData, { spaces: 2 });
      
      // 최신 파일로도 저장
      const latestFilepath = path.join(reportsDir, 'quality-report-latest.json');
      await fs.writeJson(latestFilepath, saveData, { spaces: 2 });
      
      console.log(`품질 보고서 저장됨: ${filepath}`);
      
    } catch (error) {
      console.error('품질 보고서 저장 실패:', error);
    }
  }

  // 품질 검사 요약 출력
  printQualitySummary() {
    console.log('\n=== 품질 검증 결과 ===');
    
    const passedCount = this.qualityReports.filter(r => r.status === 'PASSED').length;
    const failedCount = this.qualityReports.filter(r => r.status === 'NEEDS_IMPROVEMENT').length;
    const avgScore = Math.round(
      this.qualityReports.reduce((sum, r) => sum + r.scores.total, 0) / this.qualityReports.length
    );
    
    console.log(`📊 검증 현황:`);
    console.log(`   - 전체 기사: ${this.qualityReports.length}개`);
    console.log(`   - 발행 준비 완료: ${passedCount}개 (${Math.round(passedCount / this.qualityReports.length * 100)}%)`);
    console.log(`   - 개선 필요: ${failedCount}개 (${Math.round(failedCount / this.qualityReports.length * 100)}%)`);
    console.log(`   - 평균 점수: ${avgScore}점`);
    
    if (this.qualityReports.length > 0) {
      console.log('\n📝 기사별 검증 결과:');
      this.qualityReports.forEach((report, index) => {
        const status = report.status === 'PASSED' ? '✅ 통과' : '❌ 개선필요';
        console.log(`   ${index + 1}. ${status} [${report.scores.total}점] ${report.article.title}`);
        console.log(`      브런치스타일: ${report.scores.brunchStyle} | 콘텐츠품질: ${report.scores.contentQuality} | 가독성: ${report.scores.readability} | SEO: ${report.scores.seoOptimization}`);
        
        if (report.recommendations.priority.length > 0) {
          console.log(`      🚨 우선개선: ${report.recommendations.priority.map(p => p.category).join(', ')}`);
        }
        console.log('');
      });
    }
    
    console.log('=== 품질 검증 완료 ===\n');
  }

  // 유틸리티 메서드들
  findBestTemplateMatch(text, templates) {
    if (!templates || templates.length === 0) return 0;
    
    let maxSimilarity = 0;
    templates.forEach(template => {
      const similarity = this.calculateTextSimilarity(text, template);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    });
    
    return maxSimilarity;
  }

  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  calculateVariance(numbers) {
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  }

  generateStyleFeedback(scores) {
    const feedback = [];
    
    if (scores.titlePattern < 70) {
      feedback.push('제목을 15-25자로 조정하고 브런치 스타일 템플릿을 참고하세요.');
    }
    
    if (scores.toneAndManner < 70) {
      feedback.push('더 친근하고 개인적인 어조로 작성하세요. "요즘", "개인적으로" 등의 표현을 활용하세요.');
    }
    
    if (scores.structuralSimilarity < 70) {
      feedback.push('문단 구성을 4-6개로 조정하고 적정 글자 수(800-1200자)를 맞추세요.');
    }
    
    return feedback;
  }

  generateContentFeedback(scores) {
    const feedback = [];
    
    if (scores.informationAccuracy < 70) {
      feedback.push('더 구체적이고 정확한 정보를 포함하세요.');
    }
    
    if (scores.logicalFlow < 70) {
      feedback.push('문단 간 연결어를 사용하여 논리적 흐름을 개선하세요.');
    }
    
    if (scores.originality < 70) {
      feedback.push('개인적인 경험이나 독창적인 관점을 더 많이 포함하세요.');
    }
    
    return feedback;
  }

  generateReadabilityFeedback(scores) {
    const feedback = [];
    
    if (scores.readabilityScore < 70) {
      feedback.push('문장을 더 간결하게 만들고 복잡한 표현을 피하세요.');
    }
    
    if (scores.clarity < 70) {
      feedback.push('더 쉬운 단어를 사용하고 명확한 표현을 사용하세요.');
    }
    
    if (scores.practicalAdvice < 70) {
      feedback.push('실용적인 팁이나 구체적인 실행 방안을 추가하세요.');
    }
    
    return feedback;
  }

  generateSEOFeedback(scores) {
    const feedback = [];
    
    if (scores.keywordDensity < 70) {
      feedback.push('관련 키워드를 자연스럽게 더 포함하세요 (전체 글의 1-3%).');
    }
    
    if (scores.titleOptimization < 70) {
      feedback.push('제목에 주요 키워드를 포함하고 숫자를 활용하세요.');
    }
    
    if (scores.hashtagRelevance < 70) {
      feedback.push('본문 내용과 관련성이 높은 해시태그 3-5개를 선택하세요.');
    }
    
    return feedback;
  }

  // 단일 기사 품질 검사 (테스트용)
  async checkSingleArticle(articleIndex = 0) {
    try {
      await this.loadStyleTemplate();
      await this.loadGeneratedArticles();
      
      if (articleIndex >= this.generatedArticles.length) {
        throw new Error('유효하지 않은 기사 인덱스입니다.');
      }
      
      const article = this.generatedArticles[articleIndex];
      console.log(`단일 기사 품질 검사: ${article.title}`);
      
      const report = await this.generateQualityReport(article);
      
      console.log('\n=== 품질 검사 결과 ===');
      console.log(`총점: ${report.scores.total}점 (${report.status})`);
      console.log(`브런치 스타일: ${report.scores.brunchStyle}점`);
      console.log(`콘텐츠 품질: ${report.scores.contentQuality}점`);
      console.log(`가독성: ${report.scores.readability}점`);
      console.log(`SEO 최적화: ${report.scores.seoOptimization}점`);
      
      if (report.recommendations.priority.length > 0) {
        console.log('\n🚨 우선 개선사항:');
        report.recommendations.priority.forEach(rec => {
          console.log(`   - ${rec.category}: ${rec.issue}`);
          console.log(`     해결방안: ${rec.solution}`);
        });
      }
      
      return report;
      
    } catch (error) {
      console.error('단일 기사 품질 검사 실패:', error);
      throw error;
    }
  }

  // 전체 프로세스 실행
  async run() {
    try {
      const results = await this.performQualityCheck();
      return results;
      
    } catch (error) {
      console.error('품질 검사 프로세스 실패:', error);
      throw error;
    }
  }
}

module.exports = QualityChecker;

// 직접 실행 시 테스트
if (require.main === module) {
  const checker = new QualityChecker();
  
  // 인자에 따라 단일/전체 실행
  const args = process.argv.slice(2);
  if (args.includes('--single')) {
    const index = parseInt(args[args.indexOf('--single') + 1]) || 0;
    checker.checkSingleArticle(index)
      .then(report => {
        console.log('단일 기사 품질 검사 완료!');
      })
      .catch(error => {
        console.error('단일 기사 품질 검사 실패:', error.message);
        process.exit(1);
      });
  } else {
    checker.run()
      .then(results => {
        console.log('전체 품질 검사 완료!');
      })
      .catch(error => {
        console.error('품질 검사 실패:', error.message);
        process.exit(1);
      });
  }
}