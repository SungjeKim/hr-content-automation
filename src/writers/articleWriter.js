require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { OpenAI } = require('openai');

class ArticleWriter {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.styleTemplate
 = null;
    this.filteredArticles = [];
    this.generatedArticles = [];
    this.structureRatios = {
      introduction: 0.15,
      summary: 0.30,
      insights: 0.40,
      application: 0.10,
      closing: 0.05
    };
  }

  async loadStyleTemplate() {
    const templatePath = path.join(__dirname, '../../data/analysis/style-template.json');
    if (!await fs.pathExists(templatePath)) throw new Error('스타일 템플릿을 찾을 수 없습니다.');
    this.styleTemplate = await fs.readJson(templatePath);
    return this.styleTemplate;
  }

  async loadFilteredArticles() {
    const articlesPath = path.join(__dirname, '../../data/articles/filtered-articles-latest.json');
    if (!await fs.pathExists(articlesPath)) throw new Error('필터링된 기사를 찾을 수 없습니다.');
    const data = await fs.readJson(articlesPath);
    this.filteredArticles = data.articles || [];
    return this.filteredArticles;
  }

  generateBrunchTitle(article) {
    const templates = this.styleTemplate?.templates?.title || [
      "효과적인 [주제]에 대한 이야기",
      "성공적인 [주제]에 대한 이야기",
      "[주제]를 위한 N가지 방법"
    ];
    const keywords = this.extractKeywords(article.title);
    const mainKeyword = keywords[0] || '직장생활';
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.includes('N가지')
      ? template.replace('[주제]', mainKeyword).replace('N', Math.floor(Math.random() * 3) + 3)
      : template.replace('[주제]', mainKeyword);
  }

  extractKeywords(text) {
    const hrKeywords = [ '조직문화', '리더십', '커뮤니케이션', '성과관리', '인사관리',
      '채용', '면접', '교육', '훈련', '평가', '직무', '팀워크', '워라밸',
      '원격근무', '하이브리드', '디지털전환', 'MZ세대' ];
    return hrKeywords.filter(k => text.toLowerCase().includes(k.toLowerCase())) || ['직장생활'];
  }

  buildPrompt(article, styleContext) {
    const titleTemplate = this.generateBrunchTitle(article);
    return `다음 HR 기사를 바탕으로 브런치 스타일의 개인적이고 감성적인 글을 작성해주세요.\n\n[원본 기사 정보]\n제목: ${article.title}\n요약: ${article.summary}\n키워드: ${article.keywords?.join(', ') || ''}\n\n[브런치 스타일 가이드]\n- 제목: ${titleTemplate} (15-25자)\n- 전체 길이: 800-1200자\n- 문단 구성: 5-6개 문단\n- 톤: 친근하고 개인적이며 경험을 공유하는 느낌\n- 구조 비율:\n  * 개인적 도입부 (15%)\n  * 기사 요약 (30%)\n  * 개인적 통찰 (40%)\n  * 실무 적용 (10%)\n  * 마무리 (5%)\n\n[작성 요구사항]\n1. "요즘", "최근에", "얼마 전" 등으로 시작\n2. 쉬운 표현과 구체적인 예시 사용\n3. 독자와 소통하는 문체\n4. 감성적이면서 실용적인 마무리\n\n[작성 형식]\n[제목]\n[본문]\n[해시태그 3-5개]`;
  }

  async generateArticleWithOpenAI(article, styleContext) {
    const prompt = this.buildPrompt(article, styleContext);
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      });
      const generatedContent = completion.choices[0].message.content;
      return this.parseGeneratedContent(generatedContent, article);
    } catch (error) {
      console.error('OpenAI API 호출 실패:', error.message);
      return this.generateFallbackArticle(article);
    }
  }

  parseGeneratedContent(content, article) {
    const lines = content.split('\n').filter(line => line.trim());
    let title = '', body = '', hashtags = [], current = 'body';
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('[제목]')) current = 'title';
      else if (t.startsWith('[본문]')) current = 'body';
      else if (t.startsWith('[해시태그]')) current = 'hashtags';
      else {
        if (current === 'title') title ||= t;
        else if (current === 'body') body += t + '\n\n';
        else if (current === 'hashtags') hashtags.push(...this.extractHashtags(t));
      }
    }
    if (!title) title = this.generateBrunchTitle(article);
    if (hashtags.length === 0) hashtags = this.generateDefaultHashtags(article);
    return {
      title: title.replace(/^\[제목\]/, '').trim(),
      body: body.trim(),
      hashtags: [...new Set(hashtags)],
      originalArticle: article,
      generatedAt: new Date().toISOString(),
      wordCount: body.replace(/\s/g, '').length,
      paragraphCount: body.split('\n\n').filter(p => p.trim()).length
    };
  }

  extractHashtags(text) {
    return (text.match(/#[\w가-힣]+/g) || []).map(tag => tag.replace('#', ''));
  }

  generateDefaultHashtags(article) {
    const keywords = article.keywords || [];
    return [...keywords.slice(0, 2), '직장생활', 'HR', '조직문화'].slice(0, 4);
  }

  async generateAllArticles() {
    await this.loadStyleTemplate();
    await this.loadFilteredArticles();
    for (const article of this.filteredArticles) {
      const result = await this.generateArticleWithOpenAI(article, this.styleTemplate);
      this.generatedArticles.push(result);
      await this.delay(1000);
    }
    await this.saveGeneratedArticles();
    return this.generatedArticles;
  }

  async saveGeneratedArticles() {
    const draftsDir = path.join(__dirname, '../../data/drafts');
    await fs.ensureDir(draftsDir);
    const now = new Date();
    const filename = `articles-${now.toISOString().replace(/[:.]/g, '-')}.json`;
    await fs.writeJson(path.join(draftsDir, filename), {
      generatedAt: now.toISOString(),
      totalArticles: this.generatedArticles.length,
      articles: this.generatedArticles
    }, { spaces: 2 });
  }

  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async run() {
    try {
      const results = await this.generateAllArticles();
      console.log('✔ 모든 기사 생성 완료!');
      return results;
    } catch (err) {
      console.error('기사 생성 실패:', err);
    }
  }
}

module.exports = ArticleWriter;

if (require.main === module) {
  const writer = new ArticleWriter();
  writer.run();
}
