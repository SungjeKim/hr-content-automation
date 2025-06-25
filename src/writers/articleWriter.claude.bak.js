require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

class ArticleWriter {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    this.styleTemplate = null;
    this.filteredArticles = [];
    this.generatedArticles = [];
    
    // 글 구조 비율 (브런치 스타일)
    this.structureRatios = {
      introduction: 0.15,    // 15% - 개인적인 도입부
      summary: 0.30,         // 30% - 기사 요약 및 핵심 정보
      insights: 0.40,        // 40% - 개인적 통찰과 분석
      application: 0.10,     // 10% - 실무 적용 방안
      closing: 0.05          // 5% - 마무리
    };
  }

  // 스타일 템플릿 로드
  async loadStyleTemplate() {
    try {
      console.log('브런치 스타일 템플릿 로딩 중...');
      
      const templatePath = path.join(__dirname, '../../data/analysis/style-template.json');
      
      if (!await fs.pathExists(templatePath)) {
        throw new Error('스타일 템플릿을 찾을 수 없습니다.');
      }
      
      this.styleTemplate = await fs.readJson(templatePath);
      console.log('스타일 템플릿 로딩 완료');
      
      return this.styleTemplate;
      
    } catch (error) {
      console.error('스타일 템플릿 로딩 실패:', error.message);
      throw error;
    }
  }

  // 필터링된 기사 로드
  async loadFilteredArticles() {
    try {
      console.log('필터링된 기사 로딩 중...');
      
      const articlesPath = path.join(__dirname, '../../data/articles/filtered-articles-latest.json');
      
      if (!await fs.pathExists(articlesPath)) {
        throw new Error('필터링된 기사를 찾을 수 없습니다.');
      }
      
      const data = await fs.readJson(articlesPath);
      this.filteredArticles = data.articles || [];
      
      console.log(`${this.filteredArticles.length}개 기사 로딩 완료`);
      return this.filteredArticles;
      
    } catch (error) {
      console.error('필터링된 기사 로딩 실패:', error.message);
      throw error;
    }
  }

  // 브런치 스타일 제목 생성
  generateBrunchTitle(article) {
    const templates = this.styleTemplate?.templates?.title || [
      "효과적인 [주제]에 대한 이야기",
      "성공적인 [주제]에 대한 이야기",
      "[주제]를 위한 N가지 방법"
    ];
    
    // 기사 제목에서 핵심 키워드 추출
    const keywords = this.extractKeywords(article.title);
    const mainKeyword = keywords[0] || '직장생활';
    
    // 랜덤 템플릿 선택 및 적용
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    if (template.includes('N가지')) {
      return template.replace('[주제]', mainKeyword).replace('N', Math.floor(Math.random() * 3) + 3);
    }
    
    return template.replace('[주제]', mainKeyword);
  }

  // 키워드 추출
  extractKeywords(text) {
    const hrKeywords = [
      '조직문화', '리더십', '커뮤니케이션', '성과관리', '인사관리', 
      '채용', '면접', '교육', '훈련', '평가', '직무', '팀워크',
      '워라밸', '원격근무', '하이브리드', '디지털전환', 'MZ세대'
    ];
    
    const foundKeywords = hrKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
    
    return foundKeywords.length > 0 ? foundKeywords : ['직장생활'];
  }

  // Claude API를 사용한 기사 생성
  async generateArticleWithClaude(article, styleContext) {
    try {
      const prompt = this.buildPrompt(article, styleContext);
      
      console.log(`Claude API 호출 중: ${article.title.substring(0, 30)}...`);
      
      const message = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: "user",
          content: prompt
        }]
      });

      const generatedContent = message.content[0].text;
      
      return this.parseGeneratedContent(generatedContent, article);
      
    } catch (error) {
      console.error('Claude API 호출 실패:', error.message);
      
      // API 실패 시 기본 구조로 대체
      return this.generateFallbackArticle(article);
    }
  }

  // 프롬프트 구성
  buildPrompt(article, styleContext) {
    const titleTemplate = this.generateBrunchTitle(article);
    
    return `다음 HR 기사를 바탕으로 브런치 스타일의 개인적이고 감성적인 글을 작성해주세요.

[원본 기사 정보]
제목: ${article.title}
요약: ${article.summary}
키워드: ${article.keywords?.join(', ') || ''}

[브런치 스타일 가이드]
- 제목: ${titleTemplate} (15-25자)
- 전체 길이: 800-1200자
- 문단 구성: 5-6개 문단
- 톤: 친근하고 개인적이며 경험을 공유하는 느낌
- 구조 비율:
  * 개인적 도입부 (15%): 경험담이나 관찰로 시작
  * 기사 요약 (30%): 핵심 내용을 쉽게 설명
  * 개인적 통찰 (40%): 내 생각과 분석, 경험 연결
  * 실무 적용 (10%): 구체적인 실행 방안
  * 마무리 (5%): 감성적 마무리

[작성 요구사항]
1. 개인 경험담으로 자연스럽게 시작하기
2. "요즘", "최근에", "얼마 전" 등으로 친근하게 시작
3. 전문용어보다는 쉬운 표현 사용
4. 독자와 소통하는 듯한 문체
5. 구체적인 예시나 팁 포함
6. 감성적이지만 실용적인 마무리

글을 다음 형식으로 작성해주세요:
[제목]
[본문]
[해시태그 3-5개]`;
  }

  // 생성된 콘텐츠 파싱
  parseGeneratedContent(content, originalArticle) {
    const lines = content.split('\n').filter(line => line.trim());
    
    let title = '';
    let body = '';
    let hashtags = [];
    
    let currentSection = 'body';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('[제목]')) {
        currentSection = 'title';
        continue;
      } else if (trimmedLine.startsWith('[본문]')) {
        currentSection = 'body';
        continue;
      } else if (trimmedLine.startsWith('[해시태그]') || trimmedLine.startsWith('#')) {
        currentSection = 'hashtags';
        if (trimmedLine.startsWith('#')) {
          hashtags.push(...this.extractHashtags(trimmedLine));
        }
        continue;
      }
      
      switch (currentSection) {
        case 'title':
          if (trimmedLine && !title) {
            title = trimmedLine;
          }
          break;
        case 'body':
          if (trimmedLine) {
            body += trimmedLine + '\n\n';
          }
          break;
        case 'hashtags':
          if (trimmedLine.startsWith('#')) {
            hashtags.push(...this.extractHashtags(trimmedLine));
          }
          break;
      }
    }
    
    // 제목이 없으면 기본 제목 생성
    if (!title) {
      title = this.generateBrunchTitle(originalArticle);
    }
    
    // 해시태그가 없으면 기본 해시태그 생성
    if (hashtags.length === 0) {
      hashtags = this.generateDefaultHashtags(originalArticle);
    }
    
    return {
      title: title.replace(/^["']|["']$/g, ''), // 따옴표 제거
      body: body.trim(),
      hashtags: [...new Set(hashtags)], // 중복 제거
      originalArticle: {
        title: originalArticle.title,
        url: originalArticle.url,
        source: originalArticle.source,
        publishDate: originalArticle.publishDate
      },
      generatedAt: new Date().toISOString(),
      wordCount: body.replace(/\s/g, '').length,
      paragraphCount: body.split('\n\n').filter(p => p.trim()).length
    };
  }

  // 해시태그 추출
  extractHashtags(text) {
    const hashtagRegex = /#[\w가-힣]+/g;
    const matches = text.match(hashtagRegex) || [];
    return matches.map(tag => tag.replace('#', ''));
  }

  // 기본 해시태그 생성
  generateDefaultHashtags(article) {
    const keywords = article.keywords || [];
    const defaultTags = ['직장생활', 'HR', '조직문화'];
    
    return [...keywords.slice(0, 2), ...defaultTags].slice(0, 4);
  }

  // API 실패 시 대체 기사 생성
  generateFallbackArticle(article) {
    console.log('대체 기사 생성 중...');
    
    const title = this.generateBrunchTitle(article);
    const keywords = article.keywords || [];
    
    const body = `요즘 직장생활을 하다 보면 정말 다양한 변화를 체감하게 됩니다.

최근 "${article.title.replace(/- .+$/, '')}"라는 소식을 접하면서, 우리 조직문화에 대해 다시 한번 생각해보게 되었습니다.

${article.summary}

개인적으로 이런 변화들을 보면서 느끼는 것은, 결국 조직도 사람이 만들어가는 것이라는 점입니다. 아무리 좋은 제도와 시스템이 있어도, 구성원들이 함께 만들어가지 않으면 의미가 없죠.

실제로 우리가 할 수 있는 것들부터 시작해보면 어떨까요? 작은 변화라도 꾸준히 실행하다 보면 분명 더 나은 직장 환경을 만들 수 있을 것입니다.

변화는 언제나 작은 것에서부터 시작된다고 생각합니다.`;

    return {
      title,
      body,
      hashtags: [...keywords.slice(0, 2), '직장생활', 'HR', '조직문화'].slice(0, 4),
      originalArticle: {
        title: article.title,
        url: article.url,
        source: article.source,
        publishDate: article.publishDate
      },
      generatedAt: new Date().toISOString(),
      wordCount: body.replace(/\s/g, '').length,
      paragraphCount: body.split('\n\n').filter(p => p.trim()).length,
      fallback: true
    };
  }

  // 전체 기사 생성 프로세스
  async generateAllArticles() {
    try {
      console.log('=== 브런치 스타일 기사 생성 시작 ===');
      
      // 1. 데이터 로드
      await this.loadStyleTemplate();
      await this.loadFilteredArticles();
      
      if (this.filteredArticles.length === 0) {
        throw new Error('생성할 기사가 없습니다.');
      }
      
      // 2. 각 기사별 생성
      console.log(`${this.filteredArticles.length}개 기사 생성 중...`);
      
      for (let i = 0; i < this.filteredArticles.length; i++) {
        const article = this.filteredArticles[i];
        
        console.log(`진행률: ${i + 1}/${this.filteredArticles.length} (${((i + 1) / this.filteredArticles.length * 100).toFixed(1)}%)`);
        
        try {
          const generatedArticle = await this.generateArticleWithClaude(
            article, 
            this.styleTemplate
          );
          
          this.generatedArticles.push(generatedArticle);
          
          // API 호출 간격 (rate limit 방지)
          await this.delay(1000);
          
        } catch (error) {
          console.warn(`기사 생성 실패: ${article.title}`, error.message);
          
          // 실패한 기사도 대체 버전으로 생성
          const fallbackArticle = this.generateFallbackArticle(article);
          this.generatedArticles.push(fallbackArticle);
        }
      }
      
      // 3. 결과 저장
      await this.saveGeneratedArticles();
      
      // 4. 요약 출력
      this.printGenerationSummary();
      
      return this.generatedArticles;
      
    } catch (error) {
      console.error('기사 생성 실패:', error);
      throw error;
    }
  }

  // 생성된 기사 저장
  async saveGeneratedArticles() {
    try {
      const draftsDir = path.join(__dirname, '../../data/drafts');
      await fs.ensureDir(draftsDir);
      
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
      const filename = `articles-${timestamp[0]}-${timestamp[1].split('.')[0]}.json`;
      const filepath = path.join(draftsDir, filename);
      
      const saveData = {
        metadata: {
          generatedAt: now.toISOString(),
          totalArticles: this.generatedArticles.length,
          successCount: this.generatedArticles.filter(a => !a.fallback).length,
          fallbackCount: this.generatedArticles.filter(a => a.fallback).length,
          averageWordCount: Math.round(
            this.generatedArticles.reduce((sum, a) => sum + a.wordCount, 0) / this.generatedArticles.length
          ),
          styleTemplate: this.styleTemplate?.metadata?.version || '1.0.0'
        },
        articles: this.generatedArticles
      };
      
      await fs.writeJson(filepath, saveData, { spaces: 2 });
      
      // 최신 파일로도 저장
      const latestFilepath = path.join(draftsDir, 'articles-latest.json');
      await fs.writeJson(latestFilepath, saveData, { spaces: 2 });
      
      console.log(`생성된 기사 저장됨: ${filepath}`);
      
    } catch (error) {
      console.error('기사 저장 실패:', error);
    }
  }

  // 생성 요약 출력
  printGenerationSummary() {
    console.log('\n=== 기사 생성 결과 ===');
    
    const successCount = this.generatedArticles.filter(a => !a.fallback).length;
    const fallbackCount = this.generatedArticles.filter(a => a.fallback).length;
    const avgWordCount = Math.round(
      this.generatedArticles.reduce((sum, a) => sum + a.wordCount, 0) / this.generatedArticles.length
    );
    
    console.log(`📊 생성 현황:`);
    console.log(`   - 전체 기사: ${this.generatedArticles.length}개`);
    console.log(`   - Claude API 성공: ${successCount}개`);
    console.log(`   - 대체 생성: ${fallbackCount}개`);
    console.log(`   - 평균 글자 수: ${avgWordCount}자`);
    
    if (this.generatedArticles.length > 0) {
      console.log('\n📝 생성된 기사 목록:');
      this.generatedArticles.forEach((article, index) => {
        const status = article.fallback ? '[대체]' : '[완료]';
        console.log(`   ${index + 1}. ${status} ${article.title}`);
        console.log(`      글자 수: ${article.wordCount}자 | 문단: ${article.paragraphCount}개`);
        console.log(`      해시태그: #${article.hashtags.join(' #')}`);
        console.log(`      원본: ${article.originalArticle.title.substring(0, 50)}...`);
        console.log('');
      });
    }
    
    console.log('=== 기사 생성 완료 ===\n');
  }

  // 딜레이 유틸리티
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 단일 기사 생성 (테스트용)
  async generateSingleArticle(articleIndex = 0) {
    try {
      await this.loadStyleTemplate();
      await this.loadFilteredArticles();
      
      if (articleIndex >= this.filteredArticles.length) {
        throw new Error('유효하지 않은 기사 인덱스입니다.');
      }
      
      const article = this.filteredArticles[articleIndex];
      console.log(`단일 기사 생성: ${article.title}`);
      
      const generatedArticle = await this.generateArticleWithClaude(article, this.styleTemplate);
      
      console.log('\n=== 생성된 기사 ===');
      console.log(`제목: ${generatedArticle.title}`);
      console.log(`글자 수: ${generatedArticle.wordCount}자`);
      console.log(`\n내용:\n${generatedArticle.body}`);
      console.log(`\n해시태그: #${generatedArticle.hashtags.join(' #')}`);
      
      return generatedArticle;
      
    } catch (error) {
      console.error('단일 기사 생성 실패:', error);
      throw error;
    }
  }

  // AI를 통한 피드백 반영 재작성
  async rewriteWithFeedback(article, feedback, customPrompt = null) {
    try {
      console.log(`피드백 반영 재작성 시작: ${article.title}`);
      
      const rewritePrompt = customPrompt || this.buildRewritePrompt(article, feedback);
      
      const message = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: "user",
          content: rewritePrompt
        }]
      });

      const rewrittenContent = message.content[0].text;
      
      // 재작성된 내용 파싱
      const parsedContent = this.parseRewrittenContent(rewrittenContent, article);
      
      console.log('피드백 반영 재작성 완료');
      return parsedContent;
      
    } catch (error) {
      console.error('피드백 반영 재작성 실패:', error.message);
      
      // API 실패 시 기본 수정 반영
      return this.applyBasicFeedback(article, feedback);
    }
  }

  // 재작성 프롬프트 구성
  buildRewritePrompt(article, feedback) {
    return `다음 글을 사용자 피드백에 따라 수정해주세요.

[기존 글]
제목: ${article.title}
내용: ${article.body}
해시태그: ${article.hashtags?.join(', ') || ''}

[사용자 피드백]
${feedback}

[수정 요구사항]
1. 피드백을 충실히 반영해주세요
2. 브런치 플랫폼에 적합한 개인적이고 감성적인 톤을 유지해주세요
3. 전체적인 글의 구조와 흐름을 개선해주세요
4. 독자에게 더 유익하고 흥미로운 내용으로 만들어주세요
5. 글자 수는 800-1200자를 유지해주세요

다음 형식으로 수정된 글을 작성해주세요:
---
[제목]
수정된 제목

[본문]
수정된 본문 내용

[해시태그]
#수정된해시태그1 #수정된해시태그2 #수정된해시태그3
---`;
  }

  // 재작성된 내용 파싱
  parseRewrittenContent(content, originalArticle) {
    const lines = content.split('\n').filter(line => line.trim());
    
    let title = '';
    let body = '';
    let hashtags = [];
    
    let currentSection = 'none';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.includes('[제목]')) {
        currentSection = 'title';
        continue;
      } else if (trimmedLine.includes('[본문]')) {
        currentSection = 'body';
        continue;
      } else if (trimmedLine.includes('[해시태그]') || (trimmedLine.startsWith('#') && currentSection !== 'body')) {
        currentSection = 'hashtags';
        if (trimmedLine.startsWith('#')) {
          hashtags.push(...this.extractHashtags(trimmedLine));
        }
        continue;
      } else if (trimmedLine === '---') {
        continue;
      }
      
      switch (currentSection) {
        case 'title':
          if (trimmedLine && !title) {
            title = trimmedLine;
          }
          break;
        case 'body':
          if (trimmedLine) {
            body += trimmedLine + '\n\n';
          }
          break;
        case 'hashtags':
          if (trimmedLine.startsWith('#')) {
            hashtags.push(...this.extractHashtags(trimmedLine));
          }
          break;
      }
    }
    
    // 파싱 실패 시 기본값 사용
    if (!title) {
      title = originalArticle.title;
    }
    if (!body.trim()) {
      body = originalArticle.body;
    }
    if (hashtags.length === 0) {
      hashtags = originalArticle.hashtags || this.generateDefaultHashtags(originalArticle);
    }
    
    return {
      title: title.replace(/^["']|["']$/g, ''),
      body: body.trim(),
      hashtags: [...new Set(hashtags)],
      originalArticle: originalArticle.originalArticle || {
        title: originalArticle.title,
        url: originalArticle.url,
        source: originalArticle.source,
        publishDate: originalArticle.publishDate
      },
      revisedAt: new Date().toISOString(),
      wordCount: body.replace(/\s/g, '').length,
      paragraphCount: body.split('\n\n').filter(p => p.trim()).length,
      revisionType: 'ai-feedback'
    };
  }

  // 기본 피드백 적용 (API 실패 시)
  applyBasicFeedback(article, feedback) {
    console.log('기본 피드백 적용 중...');
    
    let modifiedBody = article.body;
    
    // 피드백에 따른 간단한 수정
    if (feedback.includes('짧게') || feedback.includes('간결')) {
      // 각 문단을 짧게 만들기
      modifiedBody = modifiedBody
        .split('\n\n')
        .map(paragraph => {
          const sentences = paragraph.split('. ');
          return sentences.slice(0, Math.max(1, Math.floor(sentences.length * 0.7))).join('. ');
        })
        .join('\n\n');
    }
    
    if (feedback.includes('구체적') || feedback.includes('예시')) {
      // 마지막에 구체적인 예시 추가
      modifiedBody += '\n\n예를 들어, 실제 업무에서 이런 상황을 경험해보셨을 것입니다. 작은 변화부터 시작해보면 분명 좋은 결과를 얻을 수 있을 것입니다.';
    }
    
    if (feedback.includes('감성적') || feedback.includes('개인적')) {
      // 개인적인 톤 강화
      modifiedBody = '개인적으로 ' + modifiedBody;
      modifiedBody += '\n\n이런 경험들을 통해 배운 것은, 결국 변화는 우리 모두가 함께 만들어가는 것이라는 점입니다.';
    }
    
    return {
      title: article.title,
      body: modifiedBody.trim(),
      hashtags: article.hashtags || [],
      originalArticle: article.originalArticle || {
        title: article.title,
        url: article.url,
        source: article.source,
        publishDate: article.publishDate
      },
      revisedAt: new Date().toISOString(),
      wordCount: modifiedBody.replace(/\s/g, '').length,
      paragraphCount: modifiedBody.split('\n\n').filter(p => p.trim()).length,
      revisionType: 'basic-feedback',
      feedback: feedback
    };
  }

  // 전체 프로세스 실행
  async run() {
    try {
      const results = await this.generateAllArticles();
      return results;
      
    } catch (error) {
      console.error('기사 생성 프로세스 실패:', error);
      throw error;
    }
  }
}

module.exports = ArticleWriter;

// 직접 실행 시 테스트
if (require.main === module) {
  const writer = new ArticleWriter();
  
  // 환경변수 확인
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }
  
  // 인자에 따라 단일/전체 실행
  const args = process.argv.slice(2);
  if (args.includes('--single')) {
    const index = parseInt(args[args.indexOf('--single') + 1]) || 0;
    writer.generateSingleArticle(index)
      .then(result => {
        console.log('단일 기사 생성 완료!');
      })
      .catch(error => {
        console.error('단일 기사 생성 실패:', error.message);
        process.exit(1);
      });
  } else {
    writer.run()
      .then(results => {
        console.log('모든 기사 생성 완료!');
      })
      .catch(error => {
        console.error('기사 생성 실패:', error.message);
        process.exit(1);
      });
  }
}