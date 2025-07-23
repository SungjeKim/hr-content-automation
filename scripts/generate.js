// scripts/generate.js
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateArticle(title, summary) {
  const prompt = `너는 브런치 작가 "mikary"의 스타일을 잘 아는 인공지능이야.
아래 제목과 요약을 바탕으로 브런치 스타일의 글을 써줘. 
한국어로 자연스럽고 따뜻하며 통찰력 있게 작성해줘.

제목: ${title}
요약: ${summary}

글:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1000,
  });

  return completion.choices[0].message.content.trim();
}

module.exports = { generateArticle };
