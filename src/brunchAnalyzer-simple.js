const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

class SimpleBrunchAnalyzer {
  constructor() {
    this.posts = [];
    this.analysisResults = {};
    this.baseUrl = 'https://brunch.co.kr';
    this.delay = 2000;
  }

  // 브런치 페이지 스크래핑 (Axios + Cheerio 사용)
  async scrapeBrunchPage(username = 'mikary') {
    try {
      console.log(`브런치 페이지 스크래핑 시작: @${username}`);
      
      const profileUrl = `${this.baseUrl}/@${username}`;
      console.log(`프로필 페이지 접속: ${profileUrl}`);
      
      // 프로필 페이지 요청
      const response = await axios.get(profileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 30000
      });
      
      const $ = cheerio.load(response.data);
      
      // 게시글 링크 수집
      const postLinks = [];
      $('.wrap_article_list .item_article').each((index, element) => {
        const $element = $(element);
        const linkElement = $element.find('.link_post');
        const titleElement = $element.find('.tit_subject');
        const excerptElement = $element.find('.txt_desc');
        
        if (linkElement.length && titleElement.length) {
          postLinks.push({
            url: linkElement.attr('href'),
            title: titleElement.text().trim(),
            excerpt: excerptElement.text().trim()
          });
        }
      });
      
      console.log(`발견된 게시글: ${postLinks.length}개`);
      
      if (postLinks.length === 0) {
        console.log('게시글을 찾을 수 없습니다. 샘플 데이터로 분석을 진행합니다.');
        return this.generateSampleData();
      }
      
      // 각 게시글 상세 내용 수집 (최대 10개)
      const posts = [];
      const maxPosts = Math.min(postLinks.length, 10);
      
      for (let i = 0; i < maxPosts; i++) {
        try {
          console.log(`게시글 분석 중 (${i + 1}/${maxPosts}): ${postLinks[i].title}`);
          
          const postContent = await this.scrapePostContent(postLinks[i]);
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
      
      if (posts.length === 0) {
        console.log('상세 게시글 수집 실패. 샘플 데이터로 분석을 진행합니다.');
        return this.generateSampleData();
      }
      
      this.posts = posts;
      console.log(`분석 완료: ${posts.length}개 게시글`);
      
      return posts;
      
    } catch (error) {
      console.error('브런치 페이지 스크래핑 오류:', error.message);
      console.log('샘플 데이터로 분석을 진행합니다.');
      return this.generateSampleData();
    }
  }

  // 게시글 상세 내용 수집
  async scrapePostContent(postInfo) {
    try {
      const response = await axios.get(postInfo.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 20000
      });
      
      const $ = cheerio.load(response.data);
      
      // 제목
      const title = $('.cover_title').text().trim() || postInfo.title;
      
      // 본문 문단 추출
      const paragraphs = [];
      $('.wrap_body p, .wrap_body .text').each((index, element) => {
        const text = $(element).text().trim();
        if (text.length > 10) {
          paragraphs.push(text);
        }
      });
      
      // 해시태그 추출
      const hashtags = [];
      $('.wrap_keyword .txt_keyword').each((index, element) => {
        hashtags.push($(element).text().trim());
      });
      
      return {
        title,
        excerpt: postInfo.excerpt,
        url: postInfo.url,
        paragraphs,
        fullText: paragraphs.join('\n\n'),
        hashtags,
        scrapedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.warn(`게시글 내용 수집 실패: ${postInfo.title}`, error.message);
      return null;
    }
  }

  // 샘플 데이터 생성 (스크래핑 실패 시 사용)
  generateSampleData() {
    console.log('샘플 데이터 생성 중...');
    
    const samplePosts = [
      {
        title: '효과적인 팀 커뮤니케이션을 위한 5가지 방법',
        excerpt: '원활한 팀워크를 위한 커뮤니케이션 스킬을 알아보세요.',
        url: 'https://brunch.co.kr/@mikary/sample1',
        paragraphs: [
          '요즘 원격근무가 늘어나면서 팀 커뮤니케이션의 중요성이 더욱 부각되고 있습니다.',
          '효과적인 커뮤니케이션을 위해서는 명확한 의사소통이 필요합니다.',
          '첫 번째로, 목적을 분명히 하는 것이 중요합니다.',
          '두 번째로, 상대방의 입장을 이해하려고 노력해야 합니다.',
          '마지막으로, 정기적인 피드백을 통해 소통의 질을 높일 수 있습니다.'
        ],
        fullText: '요즘 원격근무가 늘어나면서 팀 커뮤니케이션의 중요성이 더욱 부각되고 있습니다.\n\n효과적인 커뮤니케이션을 위해서는 명확한 의사소통이 필요합니다.\n\n첫 번째로, 목적을 분명히 하는 것이 중요합니다.\n\n두 번째로, 상대방의 입장을 이해하려고 노력해야 합니다.\n\n마지막으로, 정기적인 피드백을 통해 소통의 질을 높일 수 있습니다.',
        hashtags: ['커뮤니케이션', '팀워크', '직장생활', 'HR'],
        scrapedAt: new Date().toISOString()
      },
      {
        title: '성공적인 인재 채용을 위한 면접 노하우',
        excerpt: '좋은 인재를 찾기 위한 효과적인 면접 방법을 소개합니다.',
        url: 'https://brunch.co.kr/@mikary/sample2',
        paragraphs: [
          '채용은 회사의 미래를 결정하는 중요한 과정입니다.',
          '면접관으로서 준비해야 할 것들이 많습니다.',
          '지원자의 역량을 정확히 파악하는 것이 핵심입니다.',
          '또한 회사 문화에 맞는 인재인지 판단해야 합니다.',
          '결론적으로, 체계적인 면접 프로세스가 성공의 열쇠입니다.'
        ],
        fullText: '채용은 회사의 미래를 결정하는 중요한 과정입니다.\n\n면접관으로서 준비해야 할 것들이 많습니다.\n\n지원자의 역량을 정확히 파악하는 것이 핵심입니다.\n\n또한 회사 문화에 맞는 인재인지 판단해야 합니다.\n\n결론적으로, 체계적인 면접 프로세스가 성공의 열쇠입니다.',
        hashtags: ['채용', '면접', '인사관리', '채용담당자'],
        scrapedAt: new Date().toISOString()
      },
      {
        title: '직장인을 위한 스트레스 관리법',
        excerpt: '바쁜 직장생활 중에도 건강하게 스트레스를 관리하는 방법들',
        url: 'https://brunch.co.kr/@mikary/sample3',
        paragraphs: [
          '현대 직장인들은 다양한 스트레스에 노출되어 있습니다.',
          '업무량 증가와 경쟁 심화로 인한 압박감이 큽니다.',
          '이런 상황에서 스트레스 관리는 선택이 아닌 필수입니다.',
          '규칙적인 운동과 충분한 휴식이 도움이 됩니다.',
          '무엇보다 자신만의 스트레스 해소법을 찾는 것이 중요합니다.'
        ],
        fullText: '현대 직장인들은 다양한 스트레스에 노출되어 있습니다.\n\n업무량 증가와 경쟁 심화로 인한 압박감이 큽니다.\n\n이런 상황에서 스트레스 관리는 선택이 아닌 필수입니다.\n\n규칙적인 운동과 충분한 휴식이 도움이 됩니다.\n\n무엇보다 자신만의 스트레스 해소법을 찾는 것이 중요합니다.',
        hashtags: ['스트레스관리', '직장생활', '웰빙', '건강'],
        scrapedAt: new Date().toISOString()
      }
    ];
    
    this.posts = samplePosts;
    return samplePosts;
  }

  // 분석 메서드들 (기존과 동일)
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
      questionTitles: titles.filter(t => t.includes('?')).length,
      exclamationTitles: titles.filter(t => t.includes('!')).length,
      numberedTitles: titles.filter(t => /\d+/.test(t)).length,
      startingWords: this.analyzeStartingWords(titles),
      frequentWords: this.getWordFrequency(titles.join(' '), 10),
      punctuationUsage: this.analyzePunctuation(titles)
    };
    
    this.analysisResults.titlePatterns = analysis;
    return analysis;
  }

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
      questionStart: introductions.filter(intro => intro.includes('?')).length,
      exclamationStart: introductions.filter(intro => intro.includes('!')).length,
      commonStartPhrases: this.findCommonStartPhrases(introductions),
      sentenceStructure: this.analyzeSentenceStructure(introductions)
    };
    
    this.analysisResults.introductionStyle = analysis;
    return analysis;
  }

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
      averageParagraphs: this.calculateAverage(paragraphCounts),
      paragraphDistribution: this.getDistribution(paragraphCounts),
      averageSentencesPerParagraph: this.calculateAverage(sentenceCounts.flat()),
      paragraphLengths: this.analyzeParagraphLengths(validPosts),
      structureTypes: this.classifyStructures(paragraphCounts)
    };
    
    this.analysisResults.paragraphStructure = analysis;
    return analysis;
  }

  analyzeFrequentExpressions() {
    console.log('자주 사용하는 표현 분석 중...');
    
    const allText = this.posts.map(post => post.fullText).join('\n');
    
    if (!allText.trim()) {
      return { error: '분석할 텍스트가 없습니다.' };
    }
    
    const analysis = {
      frequentWords: this.getWordFrequency(allText, 20),
      transitionWords: this.findTransitionWords(allText),
      emotionalExpressions: this.findEmotionalWords(allText),
      emphasisWords: this.findEmphasisWords(allText)
    };
    
    this.analysisResults.frequentExpressions = analysis;
    return analysis;
  }

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
      optimalRange: this.estimateOptimalLength(lengths),
      lengthCategories: this.categorizeLengths(lengths)
    };
    
    this.analysisResults.articleLength = analysis;
    return analysis;
  }

  analyzeHashtagPatterns() {
    console.log('해시태그 패턴 분석 중...');
    
    const allHashtags = this.posts.flatMap(post => post.hashtags || []);
    
    if (allHashtags.length === 0) {
      return { error: '분석할 해시태그가 없습니다.' };
    }
    
    const analysis = {
      totalCount: allHashtags.length,
      averagePerPost: allHashtags.length / this.posts.length,
      mostFrequent: this.getWordFrequency(allHashtags.join(' '), 15),
      categories: this.categorizeHashtags(allHashtags),
      lengthDistribution: this.getDistribution(allHashtags.map(tag => tag.length)),
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
        throw new Error('분석할 게시글이 없습니다.');
      }
      
      // 2. 각종 분석 수행
      this.analyzeTitlePatterns();
      this.analyzeIntroductionStyle();
      this.analyzeParagraphStructure();
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
      console.log(`   - 숫자 포함: ${tp.numberedTitles}개 (${(tp.numberedTitles/tp.totalCount*100).toFixed(1)}%)`);
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
    
    if (this.analysisResults.frequentExpressions) {
      const fe = this.analysisResults.frequentExpressions;
      console.log(`\n💬 자주 사용하는 표현:`);
      const topWords = Object.entries(fe.frequentWords).slice(0, 5);
      topWords.forEach(([word, count], index) => {
        console.log(`   ${index + 1}. ${word} (${count}회)`);
      });
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
    const startWords = titles.map(title => title.split(' ')[0]);
    return this.getWordFrequency(startWords.join(' '), 5);
  }

  analyzePunctuation(texts) {
    return {
      periods: texts.filter(t => t.includes('.')).length,
      questions: texts.filter(t => t.includes('?')).length,
      exclamations: texts.filter(t => t.includes('!')).length,
      colons: texts.filter(t => t.includes(':')).length
    };
  }

  findCommonStartPhrases(introductions) {
    const commonStarts = ['요즘', '오늘', '최근', '이번', '지난번', '항상', '가끔', '현대'];
    const found = {};
    
    commonStarts.forEach(phrase => {
      const count = introductions.filter(intro => intro.includes(phrase)).length;
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

  findTransitionWords(text) {
    const transitions = ['그리고', '하지만', '그런데', '따라서', '그래서', '또한', '더욱이', '무엇보다', '결론적으로'];
    const found = {};
    
    transitions.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = text.match(regex);
      if (matches) found[word] = matches.length;
    });
    
    return found;
  }

  findEmotionalWords(text) {
    const emotions = ['중요', '필수', '핵심', '효과적', '성공적', '바쁜', '건강'];
    const found = {};
    
    emotions.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = text.match(regex);
      if (matches) found[word] = matches.length;
    });
    
    return found;
  }

  findEmphasisWords(text) {
    const emphasis = ['정말', '진짜', '너무', '아주', '매우', '완전', '엄청', '특히', '특별히'];
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
    const short = lengths.filter(len => len < 500).length;
    const medium = lengths.filter(len => len >= 500 && len < 1500).length;
    const long = lengths.filter(len => len >= 1500).length;
    
    return { short, medium, long };
  }

  categorizeHashtags(hashtags) {
    const categories = {
      hr: ['HR', '인사', '채용', '면접', '커뮤니케이션', '팀워크'],
      work: ['직장생활', '업무', '회사', '커리어', '비즈니스'],
      wellness: ['스트레스관리', '웰빙', '건강', '라이프'],
      management: ['관리', '리더십', '경영', '조직']
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
      korean: hashtags.filter(tag => /[가-힣]/.test(tag)).length,
      english: hashtags.filter(tag => /[a-zA-Z]/.test(tag)).length
    };
  }
}

module.exports = SimpleBrunchAnalyzer;

// 직접 실행 시 테스트
if (require.main === module) {
  const analyzer = new SimpleBrunchAnalyzer();
  
  analyzer.performCompleteAnalysis('mikary')
    .then(results => {
      console.log('분석 완료!');
    })
    .catch(error => {
      console.error('분석 실패:', error.message);
    });
}