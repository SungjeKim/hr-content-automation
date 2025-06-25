// 요약된 기사 파일 생성기
require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

(async () => {
  const inputPath = path.join(__dirname, '../../data/articles/filtered-articles-latest.json');
  const outputPath = path.join(__dirname, '../../data/articles/summarized-articles-latest.json');

  try {
    const raw = await fs.readJson(inputPath);
    const summarized = raw.articles.map(article => ({
      title: article.title,
      summary: article.summary,
      keywords: article.keywords,
      url: article.url
    }));
    await fs.outputJson(outputPath, { articles: summarized }, { spaces: 2 });
    console.log(`✅ ${summarized.length}개의 요약 기사 저장 완료`);
  } catch (error) {
    console.error('요약 기사 생성 실패:', error.message);
  }
})();
