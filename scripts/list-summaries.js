const fs = require('fs-extra');
const path = require('path');

(async () => {
  const summaryPath = path.join(__dirname, '../data/summary.json');

  if (!(await fs.pathExists(summaryPath))) {
    console.error('❌ summary.json 파일이 존재하지 않습니다.');
    return;
  }

  const summaries = await fs.readJson(summaryPath);

  console.log('\n📰 요약 기사 리스트:\n');
  summaries.forEach((item, idx) => {
    console.log(`[${idx + 1}] ${item.title}`);
  });

  console.log('\n👉 위 번호 중 하나를 선택해서 브런치 스타일 글을 작성하세요.');
})();
