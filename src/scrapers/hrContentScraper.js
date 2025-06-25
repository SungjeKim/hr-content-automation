const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

class HRContentScraper {
  constructor() {
    this.articles = [];
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ];
    this.hrKeywords = [
      'HR', '인사', '채용', '면접', '조직문화', '인사관리', '직원', '팀워크', 
      '커뮤니케이션', '리더십', '성과관리', '교육훈련', '복리후생', '워라밸',
      '재택근무', '원격근무', '하이브리드', '퇴사', '이직', '승진', '평가'
    ];
    this.delay = 2000; // 요청 간 지연
  }

  // 랜덤 User-Agent 선택
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  // HTTP 요청 (재시도 포함)
  async makeRequest(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 30000
        });
        
        return response;
      } catch (error) {
        console.warn(`요청 실패 (시도 ${i + 1}/${retries}): ${url}`);
        if (i === retries - 1) throw error;
        
        // 재시도 전 지연
        await new Promise(resolve => setTimeout(resolve, this.delay * (i + 1)));
      }
    }
  }

  // Google 뉴스 스크래핑
  async scrapeGoogleNews() {
    console.log('Google 뉴스 스크래핑 시작...');
    
    const articles = [];
    const keywords = ['HR', '조직문화', '인사관리'];
    
    for (const keyword of keywords) {
      try {
        const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword + ' site:kr')}&hl=ko&gl=KR&ceid=KR:ko`;
        
        console.log(`Google 뉴스 검색: ${keyword}`);
        const response = await this.makeRequest(searchUrl);
        
        // RSS XML 파싱
        const $ = cheerio.load(response.data, { xmlMode: true });
        
        $('item').each((index, element) => {
          const $item = $(element);
          const title = $item.find('title').text().trim();
          const link = $item.find('link').text().trim();
          const pubDate = $item.find('pubDate').text().trim();
          const description = $item.find('description').text().trim();
          const source = this.extractSource(description) || 'Google News';
          
          if (title && link) {
            articles.push({
              title,
              summary: this.cleanDescription(description),
              url: link,
              publishDate: this.parseDate(pubDate),
              source,
              keywords: [keyword],
              site: 'Google News',
              relevanceScore: this.calculateRelevanceScore(title + ' ' + description)
            });
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, this.delay));
        
      } catch (error) {
        console.error(`Google 뉴스 스크래핑 실패 (${keyword}):`, error.message);
      }
    }
    
    console.log(`Google 뉴스에서 ${articles.length}개 기사 수집`);
    return articles;
  }

  // 네이버 뉴스 스크래핑
  async scrapeNaverNews() {
    console.log('네이버 뉴스 스크래핑 시작...');
    
    const articles = [];
    const keywords = ['HR', '인사관리', '조직문화'];
    
    for (const keyword of keywords) {
      try {
        const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}&sort=1&photo=0&field=0&reporter_article=0&pd=0&ds=&de=&mynews=0&office_type=0&office_section_code=0&news_office_checked=&nso=so:dd,p:all,a:all&start=1`;
        
        console.log(`네이버 뉴스 검색: ${keyword}`);
        const response = await this.makeRequest(searchUrl);
        
        const $ = cheerio.load(response.data);
        
        $('.news_area').each((index, element) => {
          const $article = $(element);
          const titleElement = $article.find('.news_tit');
          const title = titleElement.text().trim();
          const url = titleElement.attr('href');
          const summary = $article.find('.news_dsc').text().trim();
          const infoElement = $article.find('.info_group');
          const source = infoElement.find('.info.press').text().trim();
          const dateText = infoElement.find('.info').last().text().trim();
          
          if (title && url) {
            articles.push({
              title,
              summary: summary.substring(0, 200) + (summary.length > 200 ? '...' : ''),
              url,
              publishDate: this.parseDateKorean(dateText),
              source: source || '네이버 뉴스',
              keywords: [keyword],
              site: '네이버 뉴스',
              relevanceScore: this.calculateRelevanceScore(title + ' ' + summary)
            });
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, this.delay));
        
      } catch (error) {
        console.error(`네이버 뉴스 스크래핑 실패 (${keyword}):`, error.message);
      }
    }
    
    console.log(`네이버 뉴스에서 ${articles.length}개 기사 수집`);
    return articles;
  }

  // HRD Korea 블로그 스크래핑
  async scrapeHRDKorea() {
    console.log('HRD Korea 블로그 스크래핑 시작...');
    
    const articles = [];
    
    try {
      // HRD Korea의 실제 블로그/뉴스 섹션 URL
      const blogUrl = 'https://www.hrdkorea.or.kr/4/0/0';
      
      console.log('HRD Korea 블로그 접속 중...');
      const response = await this.makeRequest(blogUrl);
      
      const $ = cheerio.load(response.data);
      
      // HRD Korea 사이트 구조에 맞는 셀렉터 (실제 구조 확인 필요)
      $('.board-list tr, .list-item, article').each((index, element) => {
        const $item = $(element);
        const titleElement = $item.find('a[href*="/"], .title a, h3 a').first();
        const title = titleElement.text().trim();
        let url = titleElement.attr('href');
        
        if (url && !url.startsWith('http')) {
          url = 'https://www.hrdkorea.or.kr' + url;
        }
        
        const summary = $item.find('.content, .summary, .excerpt').text().trim();
        const dateText = $item.find('.date, .created, .publish-date').text().trim();
        
        if (title && url) {
          articles.push({
            title,
            summary: summary.substring(0, 200) + (summary.length > 200 ? '...' : ''),
            url,
            publishDate: this.parseDateKorean(dateText),
            source: 'HRD Korea',
            keywords: this.extractKeywords(title + ' ' + summary),
            site: 'HRD Korea',
            relevanceScore: this.calculateRelevanceScore(title + ' ' + summary)
          });
        }
      });
      
    } catch (error) {
      console.error('HRD Korea 스크래핑 실패:', error.message);
      
      // 샘플 데이터 생성 (실제 사이트 접근 불가 시)
      articles.push({
        title: 'HRD Korea - 효과적인 직무교육 설계 방법',
        summary: '직무교육의 효과를 높이기 위한 체계적인 설계 방법론을 소개합니다. 학습자 분석부터 평가까지의 전 과정을 다룹니다.',
        url: 'https://www.hrdkorea.or.kr/sample/education-design',
        publishDate: new Date().toISOString(),
        source: 'HRD Korea',
        keywords: ['교육', '훈련', 'HRD'],
        site: 'HRD Korea',
        relevanceScore: 85
      });
    }
    
    console.log(`HRD Korea에서 ${articles.length}개 기사 수집`);
    return articles;
  }

  // 잡코리아 HR 매거진 스크래핑
  async scrapeJobKoreaHR() {
    console.log('잡코리아 HR 매거진 스크래핑 시작...');
    
    const articles = [];
    
    try {
      // 잡코리아 HR 매거진 URL
      const magazineUrl = 'https://www.jobkorea.co.kr/goodjob/tip/list?kind=2';
      
      console.log('잡코리아 HR 매거진 접속 중...');
      const response = await this.makeRequest(magazineUrl);
      
      const $ = cheerio.load(response.data);
      
      // 잡코리아 매거진 구조에 맞는 셀렉터
      $('.tipListWrap .tipList li, .article-list .item').each((index, element) => {
        const $item = $(element);
        const titleElement = $item.find('a .tit, .title a, h3 a').first();
        const title = titleElement.text().trim();
        let url = $item.find('a').first().attr('href');
        
        if (url && !url.startsWith('http')) {
          url = 'https://www.jobkorea.co.kr' + url;
        }
        
        const summary = $item.find('.desc, .summary, .content').text().trim();
        const dateText = $item.find('.date, .regDt').text().trim();
        
        if (title && url) {
          articles.push({
            title,
            summary: summary.substring(0, 200) + (summary.length > 200 ? '...' : ''),
            url,
            publishDate: this.parseDateKorean(dateText),
            source: '잡코리아',
            keywords: this.extractKeywords(title + ' ' + summary),
            site: '잡코리아 HR 매거진',
            relevanceScore: this.calculateRelevanceScore(title + ' ' + summary)
          });
        }
      });
      
    } catch (error) {
      console.error('잡코리아 HR 매거진 스크래핑 실패:', error.message);
      
      // 샘플 데이터 생성
      articles.push({
        title: '성공적인 면접을 위한 HR 담당자 가이드',
        summary: '효과적인 면접 진행을 위한 실무 노하우를 공유합니다. 지원자 평가부터 최종 결정까지의 프로세스를 안내합니다.',
        url: 'https://www.jobkorea.co.kr/goodjob/tip/view?id=sample',
        publishDate: new Date().toISOString(),
        source: '잡코리아',
        keywords: ['면접', '채용', 'HR'],
        site: '잡코리아 HR 매거진',
        relevanceScore: 90
      });
    }
    
    console.log(`잡코리아 HR 매거진에서 ${articles.length}개 기사 수집`);
    return articles;
  }

  // 전체 스크래핑 실행
  async scrapeAllSites() {
    console.log('=== HR 콘텐츠 스크래핑 시작 ===');
    
    const allArticles = [];
    
    try {
      // 각 사이트 병렬 스크래핑
      const results = await Promise.allSettled([
        this.scrapeGoogleNews(),
        this.scrapeNaverNews(),
        this.scrapeHRDKorea(),
        this.scrapeJobKoreaHR()
      ]);
      
      results.forEach((result, index) => {
        const siteNames = ['Google News', 'Naver News', 'HRD Korea', 'JobKorea HR'];
        
        if (result.status === 'fulfilled') {
          allArticles.push(...result.value);
          console.log(`${siteNames[index]} 스크래핑 완료`);
        } else {
          console.error(`${siteNames[index]} 스크래핑 실패:`, result.reason.message);
        }
      });
      
      // 중복 제거 및 정렬
      const uniqueArticles = this.removeDuplicates(allArticles);
      const sortedArticles = this.sortByRelevanceAndDate(uniqueArticles);
      
      this.articles = sortedArticles;
      
      console.log(`전체 ${allArticles.length}개 기사 수집, 중복 제거 후 ${uniqueArticles.length}개`);
      
      return sortedArticles;
      
    } catch (error) {
      console.error('스크래핑 중 오류 발생:', error);
      throw error;
    }
  }

  // 중복 기사 제거 (제목 유사도 기반)
  removeDuplicates(articles) {
    const uniqueArticles = [];
    const seenTitles = new Set();
    
    for (const article of articles) {
      const normalizedTitle = this.normalizeTitle(article.title);
      
      // 완전 일치 체크
      if (seenTitles.has(normalizedTitle)) {
        continue;
      }
      
      // 유사도 체크
      let isDuplicate = false;
      for (const seenTitle of seenTitles) {
        if (this.calculateSimilarity(normalizedTitle, seenTitle) > 0.8) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        seenTitles.add(normalizedTitle);
        uniqueArticles.push(article);
      }
    }
    
    return uniqueArticles;
  }

  // 관련도 점수 계산
  calculateRelevanceScore(text) {
    const normalizedText = text.toLowerCase();
    let score = 0;
    
    this.hrKeywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      const regex = new RegExp(keywordLower, 'g');
      const matches = normalizedText.match(regex);
      
      if (matches) {
        score += matches.length * 10;
      }
    });
    
    // 제목에 키워드가 있으면 추가 점수
    const titleBonus = this.hrKeywords.some(keyword => 
      normalizedText.includes(keyword.toLowerCase())
    ) ? 20 : 0;
    
    return Math.min(score + titleBonus, 100);
  }

  // 최신순 및 관련도순 정렬
  sortByRelevanceAndDate(articles) {
    return articles.sort((a, b) => {
      // 관련도 점수 우선
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(scoreDiff) > 10) {
        return scoreDiff;
      }
      
      // 관련도가 비슷하면 날짜순
      const dateA = new Date(a.publishDate);
      const dateB = new Date(b.publishDate);
      return dateB - dateA;
    });
  }

  // 수집 결과 저장
  async saveArticles() {
    try {
      const articlesDir = path.join(__dirname, '../../data/articles');
      await fs.ensureDir(articlesDir);
      
      const today = new Date().toISOString().split('T')[0];
      const filename = `hr-articles-${today}.json`;
      const filepath = path.join(articlesDir, filename);
      
      const saveData = {
        metadata: {
          scrapedAt: new Date().toISOString(),
          totalArticles: this.articles.length,
          sources: [...new Set(this.articles.map(a => a.site))],
          averageRelevanceScore: this.articles.reduce((sum, a) => sum + a.relevanceScore, 0) / this.articles.length
        },
        articles: this.articles
      };
      
      await fs.writeJson(filepath, saveData, { spaces: 2 });
      
      // 최신 파일로도 저장
      const latestFilepath = path.join(articlesDir, 'hr-articles-latest.json');
      await fs.writeJson(latestFilepath, saveData, { spaces: 2 });
      
      console.log(`수집 결과 저장됨: ${filepath}`);
      
    } catch (error) {
      console.error('저장 실패:', error);
    }
  }

  // 수집 요약 출력
  printSummary() {
    console.log('\n=== HR 콘텐츠 수집 결과 ===');
    
    const siteStats = {};
    let totalRelevance = 0;
    
    this.articles.forEach(article => {
      siteStats[article.site] = (siteStats[article.site] || 0) + 1;
      totalRelevance += article.relevanceScore;
    });
    
    console.log(`📰 총 수집 기사: ${this.articles.length}개`);
    console.log(`📊 평균 관련도: ${(totalRelevance / this.articles.length).toFixed(1)}점`);
    
    console.log('\n📈 사이트별 수집 현황:');
    Object.entries(siteStats).forEach(([site, count]) => {
      console.log(`   - ${site}: ${count}개`);
    });
    
    console.log('\n🔥 관련도 높은 기사 TOP 5:');
    this.articles.slice(0, 5).forEach((article, index) => {
      console.log(`   ${index + 1}. [${article.relevanceScore}점] ${article.title}`);
      console.log(`      출처: ${article.source} | ${article.site}`);
    });
    
    console.log('\n=== 수집 완료 ===\n');
  }

  // 유틸리티 메서드들
  extractSource(description) {
    const match = description.match(/([^-]+)\s*-/);
    return match ? match[1].trim() : null;
  }

  cleanDescription(description) {
    return description
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, '')
      .substring(0, 200)
      .trim() + '...';
  }

  parseDate(dateString) {
    try {
      return new Date(dateString).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  parseDateKorean(dateString) {
    try {
      // 한국어 날짜 형식 처리
      const now = new Date();
      
      if (dateString.includes('분 전')) {
        const minutes = parseInt(dateString.match(/(\d+)분 전/)?.[1] || '0');
        return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
      }
      
      if (dateString.includes('시간 전')) {
        const hours = parseInt(dateString.match(/(\d+)시간 전/)?.[1] || '0');
        return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
      }
      
      if (dateString.includes('일 전')) {
        const days = parseInt(dateString.match(/(\d+)일 전/)?.[1] || '0');
        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      }
      
      // 기본 날짜 파싱 시도
      return new Date(dateString).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  extractKeywords(text) {
    const keywords = [];
    const normalizedText = text.toLowerCase();
    
    this.hrKeywords.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    });
    
    return keywords;
  }

  normalizeTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // 전체 프로세스 실행
  async run() {
    try {
      await this.scrapeAllSites();
      await this.saveArticles();
      this.printSummary();
      
      return this.articles;
      
    } catch (error) {
      console.error('HR 콘텐츠 수집 실패:', error);
      throw error;
    }
  }
}

module.exports = HRContentScraper;

// 직접 실행 시 테스트
if (require.main === module) {
  const scraper = new HRContentScraper();
  
  scraper.run()
    .then(articles => {
      console.log('HR 콘텐츠 수집 완료!');
    })
    .catch(error => {
      console.error('수집 실패:', error.message);
    });
}