// routes/articles.js

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { generateArticle } = require('../scripts/generate');
const { sendEmail } = require('../scripts/mailer');

// 요약 기사 불러오기 함수
function loadSummarizedArticles() {
  const filePath = path.join(__dirname, '../data/summary.json');
  if (fs.existsSync(filePath)) {
    const json = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(json);
  }
  return [];
}

// 브런치 글 불러오기 함수
function loadBrunchArticle() {
  const filePath = path.join(__dirname, '../data/generated-brunch-article.md');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

// 기사 상세 보기
router.get('/article/:id', (req, res) => {
  const articles = loadSummarizedArticles();
  const id = parseInt(req.params.id);
  const brunchText = loadBrunchArticle();

  if (!isNaN(id) && articles[id]) {
    res.render('article', {
      article: articles[id],
      index: id,
      brunchText: brunchText
    });
  } else {
    res.status(404).send('해당 기사를 찾을 수 없습니다.');
  }
});

// 브런치 스타일 글 생성 + 이메일 발송
router.get('/generate/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const summaries = loadSummarizedArticles();

  if (isNaN(id) || !summaries[id]) {
    return res.status(404).send('해당 기사를 찾을 수 없습니다.');
  }

  const article = summaries[id];
  const title = article.title;
  const summary = article.summary;

  try {
    const blogText = await generateArticle(title, summary);
    const outputPath = path.join(__dirname, '../data/generated-brunch-article.md');
    await fs.writeFileSync(outputPath, `# ${title}\n\n${blogText}`);

    await sendEmail(title, blogText);

    res.redirect(`/article/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('글 생성 중 오류 발생');
  }
});

module.exports = router;
