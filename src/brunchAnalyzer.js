const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const natural = require('natural');
const fs = require('fs-extra');
const path = require('path');

class BrunchAnalyzer {
  constructor() {
    this.posts = [];
    this.analysisResults = {};
    this.baseUrl = 'https://brunch.co.kr';
    this.delay = 2000; // 요청 간 지연시간
  }

  // 브런치 페이지 스크래핑
  async scrapeBrunchPage(username = 'mikary') {
    let browser;
    
    try {
      console.log(`브런치 페이지 스크래핑 시작: @${username}`);
      
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const profileUrl = `${this.baseUrl}/@${username}`;
      console.log(`프로필 페이지 접속: ${profileUrl}`);
      
      await page.goto(profileUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 게시글 목록 대기
      await page.waitForSelector('.wrap_article_list', { timeout: 15000 });
      
      // 게시글 링크 수집
      const postLinks = await this.extractPostLinks(page);
      console.log(`발견된 게시글: ${postLinks.length}개`);
      
      // 각 게시글 상세 내용 수집
      const posts = [];
      const maxPosts = Math.min(postLinks.length, 20); // 최대 20개 분석
      
      for (let i = 0; i < maxPosts; i++) {
        try {
          console.log(`게시글 분석 중 (${i + 1}/${maxPosts}): ${postLinks[i].title}`);
          
          const postContent = await this.scrapePostContent(page, postLinks[i]);
          if (postContent) {
            posts.push(postContent);
          }
          
          // 요청 간 지연
          await new Promise(resolve => setTimeout(resolve, this.delay));
          
        } catch (error) {
          console.warn(`게시글 스크래핑 실패: ${postLinks[i].title}`, error.message);
          continue;
        }
      }
      
      this.posts = posts;
      console.log(`분석 완료: ${posts.length}개 게시글`);
      
      return posts;
      
    } catch (error) {
      console.error('브런치 페이지 스크래핑 오류:', error);
      throw new Error(`스크래핑 실패: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // 게시글 링크 추출
  async extractPostLinks(page) {
    return await page.evaluate(() => {
      const postElements = document.querySelectorAll('.wrap_article_list .item_article');
      
      return Array.from(postElements).map(element => {
        const linkElement = element.querySelector('.link_post');
        const titleElement = element.querySelector('.tit_subject');
        const excerptElement = element.querySelector('.txt_desc');
        
        return {
          url: linkElement ? linkElement.href : null,
          title: titleElement ? titleElement.textContent.trim() : '',
          excerpt: excerptElement ? excerptElement.textContent.trim() : ''
        };
      }).filter(post => post.url && post.title);
    });
  }

  // 게시글 상세 내용 수집
  async scrapePostContent(page, postInfo) {
    try {
      await page.goto(postInfo.url, {
        waitUntil: 'networkidle2',
        timeout: 20000
      });
      
      // 본문 대기
      await page.waitForSelector('.wrap_body', { timeout: 10000 });
      
      const content = await page.evaluate(() => {
        const bodyElement = document.querySelector('.wrap_body');
        const titleElement = document.querySelector('.cover_title');
        const hashtagElements = document.querySelectorAll('.wrap_keyword .txt_keyword');
        
        // 본문을 문단별로 분리
        const paragraphs = [];
        if (bodyElement) {
          const paragraphElements = bodyElement.querySelectorAll('p, .text');
          paragraphElements.forEach(p => {
            const text = p.textContent.trim();
            if (text.length > 10) { // 최소 길이 필터
              paragraphs.push(text);
            }
          });
        }
        
        return {
          title: titleElement ? titleElement.textContent.trim() : '',
          paragraphs: paragraphs,
          fullText: paragraphs.join('\n\n'),
          hashtags: Array.from(hashtagElements).map(tag => tag.textContent.trim())
        };
      });
      
      return {
        ...postInfo,
        ...content,
        url: postInfo.url,
        scrapedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.warn(`게시글 내용 수집 실패: ${postInfo.title}`, error.message);
      return null;
    }
  }

  // 제목 분석
  analyzeTitlePatterns() {
    console.log('제목 패턴 분석 중...');
    
    const titles = this.posts.map(post => post.title).filter(title => title);
    
    if (titles.length === 0) {
      return { error: '분석할 제목이 없습니다.' };
    }
    
    const analysis = {
      totalCount: titles.length,
      averageLength: this.calculateAverage(titles.map(t => t.length)),
      lengthDistribution: this.getDistribution(titles.map(t => t.length)),
      
      // 패턴 분석
      questionTitles: titles.filter(t => t.includes('?')).length,
      exclamationTitles: titles.filter(t => t.includes('!')).length,
      numberedTitles: titles.filter(t => /\d+/.test(t)).length,
      
      // 시작 패턴
      startingWords: this.analyzeStartingWords(titles),
      
      // 자주 사용되는 단어
      frequentWords: this.getWordFrequency(titles.join(' '), 10),
      
      // 구두점 사용
      punctuationUsage: this.analyzePunctuation(titles)
    };
    
    this.analysisResults.titlePatterns = analysis;
    return analysis;
  }

  // 도입부 분석
  analyzeIntroductionStyle() {
    console.log('도입부 스타일 분석 중...');
    
    const introductions = this.posts
      .filter(post => post.paragraphs && post.paragraphs.length > 0)
      .map(post => post.paragraphs[0]);
    
    if (introductions.length === 0) {
      return { error: '분석할 도입부가 없습니다.' };
    }
    
    const analysis = {
      totalCount: introductions.length,
      averageLength: this.calculateAverage(introductions.map(intro => intro.length)),
      
      // 첫 문장 스타일
      questionStart: introductions.filter(intro => intro.includes('?')).length,
      exclamationStart: introductions.filter(intro => intro.includes('!')).length,
      
      // 일반적인 시작 패턴
      commonStartPhrases: this.findCommonStartPhrases(introductions),
      
      // 문장 구조
      sentenceStructure: this.analyzeSentenceStructure(introductions)
    };
    
    this.analysisResults.introductionStyle = analysis;
    return analysis;
  }

  // 문단 구성 분석
  analyzeParagraphStructure() {
    console.log('문단 구성 분석 중...');
    
    const validPosts = this.posts.filter(post => post.paragraphs && post.paragraphs.length > 0);
    
    if (validPosts.length === 0) {
      return { error: '분석할 문단이 없습니다.' };
    }
    
    const paragraphCounts = validPosts.map(post => post.paragraphs.length);
    const sentenceCounts = validPosts.map(post => 
      post.paragraphs.map(p => this.countSentences(p))
    );
    
    const analysis = {
      totalPosts: validPosts.length,
      
      // 문단 수 분석
      averageParagraphs: this.calculateAverage(paragraphCounts),
      paragraphDistribution: this.getDistribution(paragraphCounts),
      
      // 문단당 문장 수
      averageSentencesPerParagraph: this.calculateAverage(
        sentenceCounts.flat()
      ),
      
      // 문단 길이 분석
      paragraphLengths: this.analyzeParagraphLengths(validPosts),
      
      // 구조 분류
      structureTypes: this.classifyStructures(paragraphCounts)
    };
    
    this.analysisResults.paragraphStructure = analysis;
    return analysis;
  }

  // 결론부 분석
  analyzeConclusionPatterns() {
    console.log('결론부 패턴 분석 중...');
    
    const conclusions = this.posts
      .filter(post => post.paragraphs && post.paragraphs.length > 1)
      .map(post => post.paragraphs[post.paragraphs.length - 1]);
    
    if (conclusions.length === 0) {
      return { error: '분석할 결론부가 없습니다.' };
    }
    
    const analysis = {
      totalCount: conclusions.length,
      averageLength: this.calculateAverage(conclusions.map(c => c.length)),
      
      // 결론 패턴
      commonConclusionPhrases: this.findConclusionPhrases(conclusions),
      
      // 마무리 스타일
      questionEnding: conclusions.filter(c => c.includes('?')).length,
      exclamationEnding: conclusions.filter(c => c.includes('!')).length,
      
      // 감정 표현
      emotionalEndings: this.findEmotionalExpressions(conclusions)
    };
    
    this.analysisResults.conclusionPatterns = analysis;
    return analysis;
  }

  // 자주 사용하는 표현 분석
  analyzeFrequentExpressions() {
    console.log('자주 사용하는 표현 분석 중...');
    
    const allText = this.posts.map(post => post.fullText).join('\n');
    
    if (!allText.trim()) {
      return { error: '분석할 텍스트가 없습니다.' };
    }
    
    const analysis = {
      // 단어 빈도
      frequentWords: this.getWordFrequency(allText, 20),
      
      // 구문 분석
      commonPhrases: this.findCommonPhrases(allText),
      
      // 연결어
      transitionWords: this.findTransitionWords(allText),
      
      // 감정 표현
      emotionalExpressions: this.findEmotionalWords(allText),
      
      // 강조 표현
      emphasisWords: this.findEmphasisWords(allText)
    };
    
    this.analysisResults.frequentExpressions = analysis;
    return analysis;
  }

  // 글 길이 분석
  analyzeArticleLength() {
    console.log('글 길이 분석 중...');
    
    const lengths = this.posts.map(post => post.fullText ? post.fullText.length : 0);
    const wordCounts = this.posts.map(post => 
      post.fullText ? post.fullText.split(/\s+/).length : 0
    );
    
    const analysis = {
      characterLength: {
        average: this.calculateAverage(lengths),
        distribution: this.getDistribution(lengths),
        range: { min: Math.min(...lengths), max: Math.max(...lengths) }
      },
      
      wordCount: {
        average: this.calculateAverage(wordCounts),
        distribution: this.getDistribution(wordCounts),
        range: { min: Math.min(...wordCounts), max: Math.max(...wordCounts) }
      },
      
      // 최적 길이 범위 추정
      optimalRange: this.estimateOptimalLength(lengths),
      
      // 길이별 분류
      lengthCategories: this.categorizeLengths(lengths)
    };
    
    this.analysisResults.articleLength = analysis;
    return analysis;
  }

  // 해시태그 패턴 분석
  analyzeHashtagPatterns() {
    console.log('해시태그 패턴 분석 중...');
    
    const allHashtags = this.posts.flatMap(post => post.hashtags || []);
    
    if (allHashtags.length === 0) {
      return { error: '분석할 해시태그가 없습니다.' };
    }
    
    const analysis = {
      totalCount: allHashtags.length,
      averagePerPost: allHashtags.length / this.posts.length,
      
      // 빈도 분석
      mostFrequent: this.getWordFrequency(allHashtags.join(' '), 15),
      
      // 카테고리 분석
      categories: this.categorizeHashtags(allHashtags),
      
      // 길이 분석
      lengthDistribution: this.getDistribution(allHashtags.map(tag => tag.length)),
      
      // 패턴 분석
      patterns: this.analyzeHashtagStructure(allHashtags)
    };
    
    this.analysisResults.hashtagPatterns = analysis;
    return analysis;
  }

  // 전체 분석 실행
  async performCompleteAnalysis(username = 'mikary') {
    try {
      console.log('=== 브런치 스타일 분석 시작 ===');
      
      // 1. 페이지 스크래핑
      await this.scrapeBrunchPage(username);
      
      if (this.posts.length === 0) {
        throw new Error('스크래핑된 게시글이 없습니다.');
      }
      
      // 2. 각종 분석 수행
      this.analyzeTitlePatterns();
      this.analyzeIntroductionStyle();
      this.analyzeParagraphStructure();
      this.analyzeConclusionPatterns();
      this.analyzeFrequentExpressions();
      this.analyzeArticleLength();
      this.analyzeHashtagPatterns();
      
      // 3. 결과 저장
      await this.saveAnalysisResults(username);
      
      // 4. 요약 출력
      this.printAnalysisSummary();
      
      return this.analysisResults;
      
    } catch (error) {
      console.error('분석 실패:', error);
      throw error;
    }
  }

  // 분석 결과 저장
  async saveAnalysisResults(username) {
    try {
      const analysisDir = path.join(__dirname, '../data/analysis');
      await fs.ensureDir(analysisDir);
      
      const results = {
        metadata: {
          username,
          analyzedAt: new Date().toISOString(),
          totalPosts: this.posts.length,
          version: '1.0.0'
        },
        analysis: this.analysisResults,
        rawData: this.posts.map(post => ({
          title: post.title,
          url: post.url,
          paragraphCount: post.paragraphs ? post.paragraphs.length : 0,
          characterCount: post.fullText ? post.fullText.length : 0,
          hashtagCount: post.hashtags ? post.hashtags.length : 0
        }))
      };
      
      const filename = `brunch-style-${username}-${Date.now()}.json`;
      const filepath = path.join(analysisDir, filename);
      
      await fs.writeJson(filepath, results, { spaces: 2 });
      
      // 최신 분석 결과도 별도 저장
      const latestFilepath = path.join(analysisDir, 'brunch-style-latest.json');
      await fs.writeJson(latestFilepath, results, { spaces: 2 });
      
      console.log(`분석 결과 저장됨: ${filepath}`);
      
    } catch (error) {
      console.error('결과 저장 실패:', error);
    }
  }

  // 분석 요약 출력
  printAnalysisSummary() {
    console.log('\n=== 브런치 스타일 분석 결과 요약 ===');
    
    if (this.analysisResults.titlePatterns) {
      const tp = this.analysisResults.titlePatterns;
      console.log(`\n📝 제목 패턴:`);
      console.log(`   - 평균 길이: ${tp.averageLength?.toFixed(1)}자`);
      console.log(`   - 질문형: ${tp.questionTitles}개 (${(tp.questionTitles/tp.totalCount*100).toFixed(1)}%)`);
      console.log(`   - 감탄형: ${tp.exclamationTitles}개 (${(tp.exclamationTitles/tp.totalCount*100).toFixed(1)}%)`);
    }
    
    if (this.analysisResults.paragraphStructure) {
      const ps = this.analysisResults.paragraphStructure;
      console.log(`\n📄 문단 구성:`);
      console.log(`   - 평균 문단 수: ${ps.averageParagraphs?.toFixed(1)}개`);
      console.log(`   - 문단당 평균 문장: ${ps.averageSentencesPerParagraph?.toFixed(1)}개`);
    }
    
    if (this.analysisResults.articleLength) {
      const al = this.analysisResults.articleLength;
      console.log(`\n📏 글 길이:`);
      console.log(`   - 평균 글자 수: ${al.characterLength.average?.toFixed(0)}자`);
      console.log(`   - 평균 단어 수: ${al.wordCount.average?.toFixed(0)}개`);
    }
    
    if (this.analysisResults.hashtagPatterns) {
      const hp = this.analysisResults.hashtagPatterns;
      console.log(`\n🏷️ 해시태그:`);
      console.log(`   - 게시글당 평균: ${hp.averagePerPost?.toFixed(1)}개`);
      console.log(`   - 총 해시태그: ${hp.totalCount}개`);
    }
    
    console.log('\n=== 분석 완료 ===\n');
  }

  // 유틸리티 메서드들
  calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  getDistribution(values) {
    if (values.length === 0) return {};
    
    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;
    
    return {
      min: sorted[0],
      max: sorted[len - 1],
      median: len % 2 === 0 
        ? (sorted[len/2 - 1] + sorted[len/2]) / 2 
        : sorted[Math.floor(len/2)],
      q1: sorted[Math.floor(len * 0.25)],
      q3: sorted[Math.floor(len * 0.75)]
    };
  }

  getWordFrequency(text, limit = 10) {
    if (!text) return {};
    
    const words = text.toLowerCase()
      .replace(/[^\w\sㄱ-ㅎ가-힣]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 1);
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .reduce((obj, [word, count]) => ({ ...obj, [word]: count }), {});
  }

  analyzeStartingWords(titles) {
    const startWords = titles.map(title => title.split(' ')[0].toLowerCase());
    return this.getWordFrequency(startWords.join(' '), 5);
  }

  analyzePunctuation(texts) {
    return {
      periods: texts.filter(t => t.includes('.')).length,
      questions: texts.filter(t => t.includes('?')).length,
      exclamations: texts.filter(t => t.includes('!')).length,
      colons: texts.filter(t => t.includes(':')).length,
      quotes: texts.filter(t => t.includes('"') || t.includes("'")).length
    };
  }

  findCommonStartPhrases(introductions) {
    const commonStarts = ['요즘', '오늘', '최근', '이번', '지난번', '항상', '가끔'];
    const found = {};
    
    commonStarts.forEach(phrase => {
      const count = introductions.filter(intro => intro.startsWith(phrase)).length;
      if (count > 0) found[phrase] = count;
    });
    
    return found;
  }

  analyzeSentenceStructure(introductions) {
    return {
      averageLength: this.calculateAverage(introductions.map(intro => intro.length)),
      averageSentences: this.calculateAverage(introductions.map(intro => this.countSentences(intro)))
    };
  }

  countSentences(text) {
    return text.split(/[.!?]/).filter(s => s.trim().length > 0).length;
  }

  analyzeParagraphLengths(posts) {
    const allParagraphs = posts.flatMap(post => post.paragraphs);
    const lengths = allParagraphs.map(p => p.length);
    
    return {
      average: this.calculateAverage(lengths),
      distribution: this.getDistribution(lengths)
    };
  }

  classifyStructures(paragraphCounts) {
    const short = paragraphCounts.filter(count => count <= 3).length;
    const medium = paragraphCounts.filter(count => count > 3 && count <= 7).length;
    const long = paragraphCounts.filter(count => count > 7).length;
    
    return { short, medium, long };
  }

  findConclusionPhrases(conclusions) {
    const conclusionWords = ['마지막으로', '결론적으로', '정리하면', '끝으로', '그래서'];
    const found = {};
    
    conclusionWords.forEach(word => {
      const count = conclusions.filter(conclusion => conclusion.includes(word)).length;
      if (count > 0) found[word] = count;
    });
    
    return found;
  }

  findEmotionalExpressions(texts) {
    const emotionWords = ['감사', '기뻐', '행복', '좋아', '사랑', '힘들', '어려', '슬프'];
    const found = {};
    
    emotionWords.forEach(word => {
      const count = texts.filter(text => text.includes(word)).length;
      if (count > 0) found[word] = count;
    });
    
    return found;
  }

  findCommonPhrases(text) {
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);
    const phrases = sentences.map(s => s.trim()).slice(0, 10);
    return phrases;
  }

  findTransitionWords(text) {
    const transitions = ['그리고', '하지만', '그런데', '따라서', '그래서', '또한', '더욱이'];
    const found = {};
    
    transitions.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = text.match(regex);
      if (matches) found[word] = matches.length;
    });
    
    return found;
  }

  findEmotionalWords(text) {
    const emotions = ['좋다', '나쁘다', '행복', '슬프다', '기쁘다', '힘들다', '어렵다'];
    const found = {};
    
    emotions.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = text.match(regex);
      if (matches) found[word] = matches.length;
    });
    
    return found;
  }

  findEmphasisWords(text) {
    const emphasis = ['정말', '진짜', '너무', '아주', '매우', '완전', '엄청'];
    const found = {};
    
    emphasis.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = text.match(regex);
      if (matches) found[word] = matches.length;
    });
    
    return found;
  }

  estimateOptimalLength(lengths) {
    const sorted = [...lengths].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(lengths.length * 0.25)];
    const q3 = sorted[Math.floor(lengths.length * 0.75)];
    
    return { min: q1, max: q3, recommended: Math.floor((q1 + q3) / 2) };
  }

  categorizeLengths(lengths) {
    const short = lengths.filter(len => len < 1000).length;
    const medium = lengths.filter(len => len >= 1000 && len < 3000).length;
    const long = lengths.filter(len => len >= 3000).length;
    
    return { short, medium, long };
  }

  categorizeHashtags(hashtags) {
    const categories = {
      lifestyle: ['일상', '생활', '라이프', '취미', '여행', '맛집'],
      work: ['직장', '업무', '회사', '커리어', '비즈니스', '성장'],
      tech: ['개발', '프로그래밍', 'IT', '기술', '코딩'],
      culture: ['문화', '예술', '영화', '음악', '책', '전시']
    };
    
    const result = {};
    Object.keys(categories).forEach(category => {
      result[category] = hashtags.filter(tag =>
        categories[category].some(keyword => tag.includes(keyword))
      ).length;
    });
    
    return result;
  }

  analyzeHashtagStructure(hashtags) {
    return {
      singleWord: hashtags.filter(tag => !tag.includes(' ')).length,
      multiWord: hashtags.filter(tag => tag.includes(' ')).length,
      withNumbers: hashtags.filter(tag => /\d/.test(tag)).length,
      withEnglish: hashtags.filter(tag => /[a-zA-Z]/.test(tag)).length,
      korean: hashtags.filter(tag => /[가-힣]/.test(tag)).length
    };
  }
}

module.exports = BrunchAnalyzer;

// 직접 실행 시 테스트
if (require.main === module) {
  const analyzer = new BrunchAnalyzer();
  
  analyzer.performCompleteAnalysis('mikary')
    .then(results => {
      console.log('분석 완료!');
    })
    .catch(error => {
      console.error('분석 실패:', error.message);
    });
}