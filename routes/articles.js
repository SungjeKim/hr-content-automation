const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');

const articlesPath = path.join(__dirname, '../data/articles/filtered-articles-latest.json');
const draftsPath = path.join(__dirname, '../data/drafts/articles-latest.json');

router.get('/', async (req, res) => {
  try {
    const articlesData = await fs.readJson(articlesPath);
    res.render('index', { articles: articlesData.articles });
  } catch (err) {
    console.error('기사 목록 로드 오류:', err);
    res.status(500).send('서버 오류');
  }
});

router.get('/articles/:id', async (req, res) => {
  const articleId = req.params.id;
  try {
    const articlesData = await fs.readJson(articlesPath);
    const draftsData = await fs.readJson(draftsPath);
    const article = articlesData.articles.find(a => a.id === articleId);
    const draft = draftsData.articles.find(a => a.id === articleId);

    if (!article) {
      return res.status(404).send('기사를 찾을 수 없습니다.');
    }

    res.render('article', {
      article,
      brunchText: draft ? draft.brunchText : null
    });
  } catch (err) {
    console.error('기사 상세 로드 오류:', err);
    res.status(500).send('서버 오류');
  }
});

module.exports = router;
