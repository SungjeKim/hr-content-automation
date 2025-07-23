const fs = require('fs-extra');
const path = require('path');

// 입력 파일 (요약 전 기사 데이터)
const inputPath = path.join(__dirname, '../data/articles/filtered-articles-latest.json');

// 출력 파일 (summary.json)
const outputPath = path.join(__dirname, '../data/summary.json');

// 요약 로직 (여기선 간단히 첫 문장만 추출)
function summarizeContent(content) {
  if (!content) return '';
  return content.split('. ')[0] + '.';
}

(async () => {
  try {
    if (!fs.existsSync(inputPath)) {
      console.error('❌ 입력 파일이 존재하지 않습니다:', inputPath);
      return;
    }

    const raw = await fs.readJson(inputPath);
    const summarized = raw.articles.map((article, idx) => ({
      title: article.title || `제목 없음 ${idx + 1}`,
      summary: summarizeContent(article.content || article.summary || ''),
      link: article.link || '#'
    }));

    await fs.writeJson(outputPath, summarized, { spaces: 2 });
    console.log(`✅ summary.json 생성 완료! 총 ${summarized.length}개 기사`);
  } catch (err) {
    console.error('🚨 요약 중 오류 발생:', err.message);
  }
})();

