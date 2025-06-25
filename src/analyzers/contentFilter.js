const fs = require('fs-extra');
const path = require('path');

class ContentFilter {
  constructor() {
    this.articles = [];
    this.filteredArticles = [];
    
    // HR 관련도 키워드 (가중치별)
    this.hrKeywords = {
      core: { // 핵심 키워드 (가중치 10)
        'HR': 10, '인사': 10, '채용': 10, '면접': 10, '조직문화': 10,
        '리더십': 10, '인사관리': 10, '성과관리': 10, '인재': 10
      },
      management: { // 관리 키워드 (가중치 8)
        '팀워크': 8, '커뮤니케이션': 8, '조직': 8, '관리': 8, '경영': 8,
        '직원': 8, '사원': 8, '임직원': 8, '근무': 8, '업무': 8
      },
      culture: { // 문화 키워드 (가중치 6)
        '문화': 6, '분위기': 6, '환경': 6, '복리후생': 6, '워라밸': 6,
        '재택근무': 6, '원격근무': 6, '하이브리드': 6, '유연근무': 6
      },
      development: { // 개발 키워드 (가중치 7)
        '교육': 7, '훈련': 7, '개발': 7, '성장': 7, '역량': 7,
        '스킬': 7, '교육훈련': 7, '연수': 7, '세미나': 7
      },
      evaluation: { // 평가 키워드 (가중치 9)
        '평가': 9, '승진': 9, '보상': 9, '급여': 9, '연봉': 9,
        '인센티브': 9, '퇴사': 9, '이직': 9, '퇴직': 9
      }
    };

    // 트렌드 키워드 (신선도 계산용)
    this.trendKeywords = {
      '디지털전환': 15, 'DX': 15, 'AI': 15, '인공지능': 15,
      'MZ세대': 12, '밀레니얼': 12, 'Z세대': 12,
      'ESG': 10, '지속가능성': 10, '다양성': 10, '포용': 10,
      '하이브리드': 8, '메타버스': 8, 'NFT': 8,
      'DEI': 7, '웰빙': 7, '번아웃': 7, '정신건강': 7
    };

    // 품질 평가 기준
    this.qualityPatterns = {
      goodTitle: [
        /\d+가지/, /방법/, /노하우/, /가이드/, /전략/, /솔루션/,
        /트렌드/, /분석/, /전망/, /사례/, /성공/, /실패/, /교훈/
      ],
      badTitle: [
        /클릭/, /충격/, /놀라운/, /대박/, /헐/, /와/, /!{2,}/,
        /\?{2,}/, /\.{3,}/, /급상승/, /화제/
      ],
      goodSummary: [
        /구체적/, /사례/, /방법/, /결과/, /효과/, /분석/, /연구/,
        /조사/, /설문/, /통계/, /데이터/, /전문가/, /의견/
      ]
    };
  }

  // 수집된 기사 로드
  async loadArticles() {
    try {
      console.log('수집된 기사 데이터 로딩 중...');
      
      const articlesDir = path.join(__dirname, '../../data/articles');
      const latestFile = path.join(articlesDir, 'hr-articles-latest.json');
      
      if (!await fs.pathExists(latestFile)) {
        throw new Error('수집된 기사 데이터를 찾을 수 없습니다.');
      }
      
      const data = await fs.readJson(latestFile);
      this.articles = data.articles || [];
      
      console.log(`${this.articles.length}개 기사 로딩 완료`);
      return this.articles;
      
    } catch (error) {
      console.error('기사 데이터 로딩 실패:', error.message);
      throw error;
    }
  }

  // HR 관련도 점수 계산 (0-100점)
  calculateRelevanceScore(article) {
    let score = 0;
    const text = (article.title + ' ' + article.summary + ' ' + (article.keywords?.join(' ') || '')).toLowerCase();
    
    // 카테고리별 키워드 검사
    Object.entries(this.hrKeywords).forEach(([category, keywords]) => {
      Object.entries(keywords).forEach(([keyword, weight]) => {
        const regex = new RegExp(keyword.toLowerCase(), 'g');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length * weight;
        }
      });
    });
    
    // 제목에 HR 키워드가 있으면 보너스
    const titleBonus = this.hasHRKeywordInTitle(article.title) ? 20 : 0;
    
    // 출처별 가중치
    const sourceBonus = this.getSourceBonus(article.source);
    
    const finalScore = Math.min(score + titleBonus + sourceBonus, 100);
    
    return {
      score: finalScore,
      details: {
        keywordScore: score,
        titleBonus,
        sourceBonus,
        category: this.categorizeHRContent(text)
      }
    };
  }

  // 신선도 점수 계산 (0-100점)
  calculateFreshnessScore(article) {
    const now = new Date();
    const publishDate = new Date(article.publishDate);
    const daysDiff = (now - publishDate) / (1000 * 60 * 60 * 24);
    
    // 날짜 기반 점수 (최근 7일 내 100점, 그 이후 감점)
    let dateScore = 100;
    if (daysDiff > 7) {
      dateScore = Math.max(100 - (daysDiff - 7) * 5, 0);
    } else if (daysDiff > 1) {
      dateScore = 100 - daysDiff * 5;
    }
    
    // 트렌드 키워드 점수
    let trendScore = 0;
    const text = (article.title + ' ' + article.summary).toLowerCase();
    
    Object.entries(this.trendKeywords).forEach(([keyword, points]) => {
      if (text.includes(keyword.toLowerCase())) {
        trendScore += points;
      }
    });
    
    // 시간대별 보너스 (오전/오후 발행 기사 선호)
    const hourBonus = this.getTimeBonus(publishDate);
    
    const finalScore = Math.min(dateScore * 0.7 + trendScore * 0.2 + hourBonus * 0.1, 100);
    
    return {
      score: finalScore,
      details: {
        dateScore,
        trendScore,
        hourBonus,
        daysDiff: Math.round(daysDiff * 10) / 10
      }
    };
  }

  // 품질 점수 계산 (0-100점)
  calculateQualityScore(article) {
    let titleScore = this.evaluateTitleQuality(article.title);
    let summaryScore = this.evaluateSummaryQuality(article.summary);
    let lengthScore = this.evaluateLengthQuality(article);
    let sourceScore = this.evaluateSourceQuality(article.source);
    
    const finalScore = (titleScore * 0.4 + summaryScore * 0.3 + lengthScore * 0.2 + sourceScore * 0.1);
    
    return {
      score: finalScore,
      details: {
        titleScore,
        summaryScore,
        lengthScore,
        sourceScore,
        titleLength: article.title.length,
        summaryLength: article.summary?.length || 0
      }
    };
  }

  // 중복도 검사
  async checkDuplication(article) {
    const duplicates = {
      brunchDuplication: await this.checkBrunchDuplication(article),
      recentDuplication: this.checkRecentDuplication(article),
      score: 0
    };
    
    // 중복도가 낮을수록 높은 점수
    const brunchPenalty = duplicates.brunchDuplication.similarity * 50;
    const recentPenalty = duplicates.recentDuplication.similarity * 30;
    
    duplicates.score = Math.max(100 - brunchPenalty - recentPenalty, 0);
    
    return duplicates;
  }

  // 브런치 기존 글과 중복 검사
  async checkBrunchDuplication(article) {
    try {
      const analysisDir = path.join(__dirname, '../../data/analysis');
      const brunchFile = path.join(analysisDir, 'brunch-style-latest.json');
      
      if (!await fs.pathExists(brunchFile)) {
        return { similarity: 0, matchedPost: null };
      }
      
      const brunchData = await fs.readJson(brunchFile);
      const brunchPosts = brunchData.rawData || [];
      
      let maxSimilarity = 0;
      let matchedPost = null;
      
      for (const post of brunchPosts) {
        const similarity = this.calculateTextSimilarity(
          article.title,
          post.title
        );
        
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          matchedPost = post;
        }
      }
      
      return { similarity: maxSimilarity, matchedPost };
      
    } catch (error) {
      console.warn('브런치 중복 검사 실패:', error.message);
      return { similarity: 0, matchedPost: null };
    }
  }

  // 최근 수집 기사와 중복 검사
  checkRecentDuplication(targetArticle) {
    let maxSimilarity = 0;
    let matchedArticle = null;
    
    for (const article of this.articles) {
      if (article.url === targetArticle.url) continue;
      
      const similarity = this.calculateTextSimilarity(
        targetArticle.title,
        article.title
      );
      
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedArticle = article;
      }
    }
    
    return { similarity: maxSimilarity, matchedArticle };
  }

  // 최종 점수 계산
  calculateFinalScore(relevance, freshness, quality, duplication) {
    const weights = {
      relevance: 0.4,
      freshness: 0.3,
      quality: 0.3
    };
    
    const baseScore = (
      relevance.score * weights.relevance +
      freshness.score * weights.freshness +
      quality.score * weights.quality
    );
    
    // 중복도 페널티 적용
    const duplicationPenalty = (100 - duplication.score) * 0.1;
    const finalScore = Math.max(baseScore - duplicationPenalty, 0);
    
    return {
      finalScore,
      breakdown: {
        relevance: relevance.score,
        freshness: freshness.score,
        quality: quality.score,
        duplication: duplication.score,
        duplicationPenalty
      }
    };
  }

  // 전체 필터링 프로세스 실행
  async performFiltering() {
    try {
      console.log('=== 콘텐츠 품질 필터링 시작 ===');
      
      // 1. 기사 로드
      await this.loadArticles();
      
      if (this.articles.length === 0) {
        throw new Error('필터링할 기사가 없습니다.');
      }
      
      // 2. 각 기사별 점수 계산
      console.log('기사별 품질 점수 계산 중...');
      const scoredArticles = [];
      
      for (let i = 0; i < this.articles.length; i++) {
        const article = this.articles[i];
        
        console.log(`진행률: ${i + 1}/${this.articles.length} (${((i + 1) / this.articles.length * 100).toFixed(1)}%)`);
        
        try {
          const relevance = this.calculateRelevanceScore(article);
          const freshness = this.calculateFreshnessScore(article);
          const quality = this.calculateQualityScore(article);
          const duplication = await this.checkDuplication(article);
          
          const finalScore = this.calculateFinalScore(relevance, freshness, quality, duplication);
          
          scoredArticles.push({
            ...article,
            scores: {
              relevance,
              freshness,
              quality,
              duplication,
              final: finalScore
            }
          });
          
        } catch (error) {
          console.warn(`기사 점수 계산 실패: ${article.title}`, error.message);
        }
      }
      
      // 3. 점수순 정렬 및 상위 선별
      const sortedArticles = scoredArticles
        .sort((a, b) => b.scores.final.finalScore - a.scores.final.finalScore);
      
      // 4. 상위 5개 기사 선별 (중복도 90% 이상인 기사 제외)
      this.filteredArticles = this.selectTopArticles(sortedArticles, 5);
      
      // 5. 결과 저장
      await this.saveFilteredResults();
      
      // 6. 요약 출력
      this.printFilteringSummary();
      
      return this.filteredArticles;
      
    } catch (error) {
      console.error('필터링 실패:', error);
      throw error;
    }
  }

  // 상위 기사 선별 (중복 제거 포함)
  selectTopArticles(sortedArticles, count) {
    const selected = [];
    const titlesSeen = new Set();
    
    for (const article of sortedArticles) {
      // 중복도가 너무 높으면 제외
      if (article.scores.duplication.score < 70) {
        continue;
      }
      
      // 제목 유사도 체크
      const normalizedTitle = this.normalizeTitle(article.title);
      let isDuplicate = false;
      
      for (const seenTitle of titlesSeen) {
        if (this.calculateTextSimilarity(normalizedTitle, seenTitle) > 0.8) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        selected.push(article);
        titlesSeen.add(normalizedTitle);
        
        if (selected.length >= count) {
          break;
        }
      }
    }
    
    return selected;
  }

  // 필터링 결과 저장
  async saveFilteredResults() {
    try {
      const articlesDir = path.join(__dirname, '../../data/articles');
      await fs.ensureDir(articlesDir);
      
      const today = new Date().toISOString().split('T')[0];
      const filename = `filtered-articles-${today}.json`;
      const filepath = path.join(articlesDir, filename);
      
      const saveData = {
        metadata: {
          filteredAt: new Date().toISOString(),
          totalProcessed: this.articles.length,
          selectedCount: this.filteredArticles.length,
          filterCriteria: {
            relevanceWeight: 0.4,
            freshnessWeight: 0.3,
            qualityWeight: 0.3,
            minDuplicationScore: 70
          }
        },
        articles: this.filteredArticles
      };
      
      await fs.writeJson(filepath, saveData, { spaces: 2 });
      
      // 최신 파일로도 저장
      const latestFilepath = path.join(articlesDir, 'filtered-articles-latest.json');
      await fs.writeJson(latestFilepath, saveData, { spaces: 2 });
      
      console.log(`필터링 결과 저장됨: ${filepath}`);
      
    } catch (error) {
      console.error('결과 저장 실패:', error);
    }
  }

  // 필터링 요약 출력
  printFilteringSummary() {
    console.log('\n=== 콘텐츠 필터링 결과 ===');
    
    console.log(`📊 처리 현황:`);
    console.log(`   - 전체 기사: ${this.articles.length}개`);
    console.log(`   - 선별 기사: ${this.filteredArticles.length}개`);
    console.log(`   - 선별율: ${(this.filteredArticles.length / this.articles.length * 100).toFixed(1)}%`);
    
    if (this.filteredArticles.length > 0) {
      const avgScore = this.filteredArticles.reduce((sum, article) => 
        sum + article.scores.final.finalScore, 0) / this.filteredArticles.length;
      
      console.log(`   - 평균 점수: ${avgScore.toFixed(1)}점`);
      
      console.log('\n🏆 선별된 TOP 기사:');
      this.filteredArticles.forEach((article, index) => {
        const scores = article.scores.final.breakdown;
        console.log(`   ${index + 1}. [${article.scores.final.finalScore.toFixed(1)}점] ${article.title}`);
        console.log(`      관련도: ${scores.relevance.toFixed(1)} | 신선도: ${scores.freshness.toFixed(1)} | 품질: ${scores.quality.toFixed(1)}`);
        console.log(`      출처: ${article.source} | 발행: ${new Date(article.publishDate).toLocaleDateString()}`);
        console.log('');
      });
    }
    
    console.log('=== 필터링 완료 ===\n');
  }

  // 유틸리티 메서드들
  hasHRKeywordInTitle(title) {
    const titleLower = title.toLowerCase();
    return Object.values(this.hrKeywords).some(keywords =>
      Object.keys(keywords).some(keyword =>
        titleLower.includes(keyword.toLowerCase())
      )
    );
  }

  getSourceBonus(source) {
    const bonuses = {
      'HRD Korea': 15,
      '잡코리아': 10,
      '사람인': 10,
      '워크넷': 8,
      '한국경제': 5,
      '매일경제': 5,
      '조선일보': 3,
      '동아일보': 3
    };
    
    return bonuses[source] || 0;
  }

  categorizeHRContent(text) {
    const categories = {
      '채용/면접': ['채용', '면접', '선발', '지원자'],
      '조직문화': ['문화', '분위기', '환경', '가치'],
      '리더십': ['리더', '관리자', '팀장', '임원'],
      '성과관리': ['평가', '성과', '목표', 'KPI'],
      '교육/개발': ['교육', '훈련', '개발', '성장'],
      '복리후생': ['복리', '후생', '혜택', '지원']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }
    
    return 'HR 일반';
  }

  getTimeBonus(publishDate) {
    const hour = publishDate.getHours();
    
    // 업무시간 (9-18시) 발행 기사에 보너스
    if (hour >= 9 && hour <= 18) {
      return 10;
    }
    
    // 저녁 시간 (19-21시) 약간의 보너스
    if (hour >= 19 && hour <= 21) {
      return 5;
    }
    
    return 0;
  }

  evaluateTitleQuality(title) {
    let score = 50; // 기본 점수
    
    // 길이 평가
    if (title.length >= 15 && title.length <= 50) {
      score += 20;
    } else if (title.length < 10 || title.length > 80) {
      score -= 20;
    }
    
    // 좋은 패턴 검사
    this.qualityPatterns.goodTitle.forEach(pattern => {
      if (pattern.test(title)) {
        score += 10;
      }
    });
    
    // 나쁜 패턴 검사
    this.qualityPatterns.badTitle.forEach(pattern => {
      if (pattern.test(title)) {
        score -= 15;
      }
    });
    
    // 숫자나 구체적 정보 포함 시 보너스
    if (/\d+/.test(title)) {
      score += 10;
    }
    
    return Math.max(Math.min(score, 100), 0);
  }

  evaluateSummaryQuality(summary) {
    if (!summary || summary.length < 20) {
      return 10;
    }
    
    let score = 50;
    
    // 길이 평가
    if (summary.length >= 100 && summary.length <= 300) {
      score += 20;
    } else if (summary.length < 50) {
      score -= 20;
    }
    
    // 좋은 패턴 검사
    this.qualityPatterns.goodSummary.forEach(pattern => {
      if (pattern.test(summary)) {
        score += 10;
      }
    });
    
    // 문장 완성도 체크
    const sentences = summary.split(/[.!?]/).filter(s => s.trim().length > 0);
    if (sentences.length >= 2) {
      score += 15;
    }
    
    return Math.max(Math.min(score, 100), 0);
  }

  evaluateLengthQuality(article) {
    const titleLength = article.title.length;
    const summaryLength = article.summary?.length || 0;
    
    let score = 50;
    
    // 제목과 요약의 균형
    if (titleLength > 10 && summaryLength > 50) {
      score += 30;
    } else if (titleLength < 5 || summaryLength < 20) {
      score -= 30;
    }
    
    return Math.max(Math.min(score, 100), 0);
  }

  evaluateSourceQuality(source) {
    const reliableSource = [
      'HRD Korea', '잡코리아', '사람인', '워크넷',
      '한국경제', '매일경제', '조선일보', '동아일보',
      '중앙일보', '경향신문', 'SBS', 'KBS', 'MBC'
    ];
    
    if (reliableSource.includes(source)) {
      return 80;
    }
    
    return 50;
  }

  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  normalizeTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 전체 프로세스 실행
  async run() {
    try {
      const results = await this.performFiltering();
      return results;
      
    } catch (error) {
      console.error('콘텐츠 필터링 실패:', error);
      throw error;
    }
  }
}

module.exports = ContentFilter;

// 직접 실행 시 테스트
if (require.main === module) {
  const filter = new ContentFilter();
  
  filter.run()
    .then(results => {
      console.log('콘텐츠 필터링 완료!');
    })
    .catch(error => {
      console.error('필터링 실패:', error.message);
    });
}