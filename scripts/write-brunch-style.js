require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');

// 📌 OpenAI 객체 생성
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 📌 이메일 전송 함수
async function sendEmail(subject, content) {
  console.log('📧 GMAIL_EMAIL:', process.env.GMAIL_EMAIL);
  console.log('📧 GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '✅ (loaded)' : '❌ (missing)');
  console.log('📧 EMAIL_TO:', process.env.EMAIL_TO);

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.GMAIL_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_EMAIL,
    to: process.env.EMAIL_TO,
    subject: subject,
    text: content,
  });

  console.log('✅ 이메일 전송 완료!');
}

// 📌 브런치 스타일 글 생성 함수
async function generateArticle(title, summary) {
  const prompt = `
너는 브런치 작가 "mikary"의 스타일을 잘 아는 인공지능이야.
아래 제목과 요약을 바탕으로 브런치 스타일의 글을 써줘.
한국어로 자연스럽고 따뜻하며 통찰력 있게 작성해줘.

제목: ${title}
요약: ${summary}

글:
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1000
  });

  return completion.choices[0].message.content.trim();
}

// 📌 실행 메인 함수
async function main() {
  try {
    const summaryPath = path.join(__dirname, '../data/summary.json');
    const summaries = await fs.readJson(summaryPath);
    const index = parseInt(process.argv[2] || '1') - 1;
    const target = summaries[index];

    const blogText = await generateArticle(target.title, target.summary);
    const outputPath = path.join(__dirname, '../data/generated-brunch-article.md');

    await fs.outputFile(outputPath, `# ${target.title}\n\n${blogText}`);
    console.log(`✅ 브런치 스타일 글 생성 완료: ${outputPath}`);

    await sendEmail(target.title, blogText);
  } catch (err) {
    console.error('❌ 오류 발생:', err.message);
  }
}

main();
