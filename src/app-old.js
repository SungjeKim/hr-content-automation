const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const BrunchAnalyzer = require('./brunchAnalyzer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

const DATA_DIR = path.join(__dirname, '../data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const ANALYSIS_FILE = path.join(DATA_DIR, 'brunch-analysis.json');

async function ensureDataFiles() {
  await fs.ensureDir(DATA_DIR);
  
  if (!await fs.pathExists(ARTICLES_FILE)) {
    await fs.writeJson(ARTICLES_FILE, []);
  }
  
  if (!await fs.pathExists(ANALYSIS_FILE)) {
    await fs.writeJson(ANALYSIS_FILE, {});
  }
}

async function loadArticles() {
  try {
    return await fs.readJson(ARTICLES_FILE);
  } catch (error) {
    console.error('Error loading articles:', error);
    return [];
  }
}

async function saveArticles(articles) {
  try {
    await fs.writeJson(ARTICLES_FILE, articles, { spaces: 2 });
  } catch (error) {
    console.error('Error saving articles:', error);
  }
}

async function loadAnalysis() {
  try {
    return await fs.readJson(ANALYSIS_FILE);
  } catch (error) {
    console.error('Error loading analysis:', error);
    return {};
  }
}

async function saveAnalysis(analysis) {
  try {
    await fs.writeJson(ANALYSIS_FILE, analysis, { spaces: 2 });
  } catch (error) {
    console.error('Error saving analysis:', error);
  }
}

app.get('/', async (req, res) => {
  try {
    const articles = await loadArticles();
    const analysis = await loadAnalysis();
    
    res.render('dashboard', {
      title: 'HR Content Automation Dashboard',
      articlesCount: articles.length,
      hasAnalysis: Object.keys(analysis).length > 0,
      recentArticles: articles.slice(-5).reverse()
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/analysis', async (req, res) => {
  try {
    const analysis = await loadAnalysis();
    res.render('analysis', {
      title: 'Brunch Analysis Results',
      analysis: analysis,
      hasData: Object.keys(analysis).length > 0
    });
  } catch (error) {
    console.error('Analysis page error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/analysis/run', async (req, res) => {
  try {
    const { username = 'mikary' } = req.body;
    
    const analyzer = new BrunchAnalyzer();
    const results = await analyzer.performCompleteAnalysis(username);
    
    await saveAnalysis({
      ...results,
      lastUpdated: new Date().toISOString(),
      username: username
    });
    
    res.json({ success: true, message: 'Analysis completed successfully' });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/articles', async (req, res) => {
  try {
    const articles = await loadArticles();
    res.render('articles', {
      title: 'HR Articles Collection',
      articles: articles
    });
  } catch (error) {
    console.error('Articles page error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/articles', async (req, res) => {
  try {
    const { title, content, category, tags, publicationType = 'manual' } = req.body;
    
    const articles = await loadArticles();
    const newArticle = {
      id: Date.now().toString(),
      title,
      content,
      category,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      publicationType,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    articles.push(newArticle);
    await saveArticles(articles);
    
    res.json({ success: true, article: newArticle });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/articles/:id', async (req, res) => {
  try {
    const articles = await loadArticles();
    const article = articles.find(a => a.id === req.params.id);
    
    if (!article) {
      return res.status(404).send('Article not found');
    }
    
    res.render('article-edit', {
      title: 'Edit Article',
      article: article
    });
  } catch (error) {
    console.error('Article view error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.put('/articles/:id', async (req, res) => {
  try {
    const { title, content, category, tags, publicationType, status } = req.body;
    const articles = await loadArticles();
    const articleIndex = articles.findIndex(a => a.id === req.params.id);
    
    if (articleIndex === -1) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    
    articles[articleIndex] = {
      ...articles[articleIndex],
      title,
      content,
      category,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      publicationType,
      status,
      updatedAt: new Date().toISOString()
    };
    
    await saveArticles(articles);
    
    res.json({ success: true, article: articles[articleIndex] });
  } catch (error) {
    console.error('Update article error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/articles/:id', async (req, res) => {
  try {
    const articles = await loadArticles();
    const filteredArticles = articles.filter(a => a.id !== req.params.id);
    
    if (filteredArticles.length === articles.length) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    
    await saveArticles(filteredArticles);
    
    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/articles/:id/publish', async (req, res) => {
  try {
    const articles = await loadArticles();
    const articleIndex = articles.findIndex(a => a.id === req.params.id);
    
    if (articleIndex === -1) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    
    articles[articleIndex].status = 'published';
    articles[articleIndex].publishedAt = new Date().toISOString();
    
    await saveArticles(articles);
    
    res.json({ success: true, message: 'Article published successfully' });
  } catch (error) {
    console.error('Publish article error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    const articles = await loadArticles();
    const { status, category, publicationType } = req.query;
    
    let filteredArticles = articles;
    
    if (status) {
      filteredArticles = filteredArticles.filter(a => a.status === status);
    }
    
    if (category) {
      filteredArticles = filteredArticles.filter(a => a.category === category);
    }
    
    if (publicationType) {
      filteredArticles = filteredArticles.filter(a => a.publicationType === publicationType);
    }
    
    res.json(filteredArticles);
  } catch (error) {
    console.error('API articles error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analysis', async (req, res) => {
  try {
    const analysis = await loadAnalysis();
    res.json(analysis);
  } catch (error) {
    console.error('API analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/publication', async (req, res) => {
  try {
    const articles = await loadArticles();
    const draftArticles = articles.filter(a => a.status === 'draft');
    const scheduledArticles = articles.filter(a => a.status === 'scheduled');
    
    res.render('publication', {
      title: 'Publication Management',
      draftArticles,
      scheduledArticles
    });
  } catch (error) {
    console.error('Publication page error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/publication/schedule', async (req, res) => {
  try {
    const { articleId, scheduleType, scheduleDate } = req.body;
    const articles = await loadArticles();
    const articleIndex = articles.findIndex(a => a.id === articleId);
    
    if (articleIndex === -1) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    
    articles[articleIndex].status = 'scheduled';
    articles[articleIndex].scheduleType = scheduleType;
    
    if (scheduleType === 'manual' && scheduleDate) {
      articles[articleIndex].scheduledDate = scheduleDate;
    } else if (scheduleType === 'automatic') {
      const now = new Date();
      now.setHours(now.getHours() + 24);
      articles[articleIndex].scheduledDate = now.toISOString();
    }
    
    await saveArticles(articles);
    
    res.json({ success: true, message: 'Article scheduled successfully' });
  } catch (error) {
    console.error('Schedule article error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    error: 'The requested page could not be found.',
    code: 404
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).render('error', {
    title: 'Internal Server Error',
    error: 'An unexpected error occurred.',
    code: 500
  });
});

async function startServer() {
  try {
    await ensureDataFiles();
    
    app.listen(PORT, () => {
      console.log(`HR Content Automation Server running on port ${PORT}`);
      console.log(`Dashboard: http://localhost:${PORT}`);
      console.log(`Analysis: http://localhost:${PORT}/analysis`);
      console.log(`Articles: http://localhost:${PORT}/articles`);
      console.log(`Publication: http://localhost:${PORT}/publication`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;