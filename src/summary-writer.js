require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 테스트용 기사 리스트 (나중에 크롤링으로 대체 가능)
const sampleArticles = [
  { title: "AI가 바꾸는 인사관리의 미래", url: "https://hrnews.com/article1" },
  { title: "MZ세대와 조직문화 갈등", url: "https://hrnews.com/article2" },
  { title: "퇴사율을 줄이는 HR 전략", url: "https://hrnews.com/article3" },
  { title: "리더십 트렌드 2025", url: "https://hrnews.com/article4" },
  { title: "AI 기반 채용 도구 효과 분석", url: "https://hrnews.com/article5" }
];

// 기사 1개당 요약 생성
async function summarizeArticle(article) {
  const prompt = `${article.title}라는 제목의 HR 기사를 300자 이내로 요약해줘.`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 300
  });

  const summary = response.choices[0].message.content;
  return {
    ...article,
    summary,
    source: "테스트 HR 뉴스",
    publishDate: new Date().toISOString().slice(0, 10)
  };
}

// 전체 기사 요약 실행
async function main() {
  const summarizedArticles = [];

  for (const article of sampleArticles) {
    console.log(`📰 요약 중: ${article.title}`);
    const result = await summarizeArticle(article);
    summarizedArticles.push(result);
  }

  const filePath = path.join(__dirname, '../data/articles/filtered-articles-latest.json');
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, { articles: summarizedArticles }, { spaces: 2 });

  console.log("✅ 요약 완료! 파일 저장됨:", filePath);
}

main().catch(err => console.error("❌ 요약 실패:", err));
