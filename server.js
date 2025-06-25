require('dotenv').config();
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// 기사 목록 보여주는 페이지
app.get('/', async (req, res) => {
  const filePath = path.join(__dirname, 'data/articles/filtered-articles-latest.json');
  const articles = (await fs.readJson(filePath)).articles || [];
  res.render('index', { articles });
});

// 사용자 선택 처리
app.post('/select', async (req, res) => {
  const { articleIndex } = req.body;
  const articles = (await fs.readJson(path.join(__dirname, 'data/articles/filtered-articles-latest.json'))).articles;
  const selected = articles[articleIndex];

  const draftsPath = path.join(__dirname, 'data/selected-article.json');
  await fs.writeJson(draftsPath, { selected }, { spaces: 2 });

  // 나중에 여기에 글 생성 기능을 연결할 예정
  res.send(`<h2>✅ 선택 완료!</h2><p>${selected.title}</p><a href="/">돌아가기</a>`);
});

app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
});
