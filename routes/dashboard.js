// routes/dashboard.js
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const summarizedPath = path.join(__dirname, '../data/articles/filtered-articles-latest.json');
        const draftsPath = path.join(__dirname, '../data/drafts/drafts-latest.json');

        const summarizedData = await fs.readJson(summarizedPath).catch(() => ({ articles: [] }));
        const draftsData = await fs.readJson(draftsPath).catch(() => ({ drafts: [] }));

        const systemStatus = {
            articles: {
                collected: summarizedData.articles?.length || 0,
                filtered: summarizedData.articles?.filter(a => a.score > 0.5).length || 0,
                lastUpdate: summarizedData.lastUpdate || null
            },
            drafts: {
                total: draftsData.drafts?.length || 0,
                lastGenerated: draftsData.lastGenerated || null
            },
            quality: {
                averageScore: summarizedData.articles?.reduce((sum, a) => sum + (a.score || 0), 0) / (summarizedData.articles?.length || 1),
                passRate: summarizedData.articles?.filter(a => a.score >= 0.7).length / (summarizedData.articles?.length || 1) * 100
            },
            api: {
                claudeStatus: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured'
            }
        };

        const recentDrafts = draftsData.drafts?.slice(-5).reverse() || [];

        res.render('dashboard', {
            title: 'HR 자동 콘텐츠 대시보드',
            systemStatus,
            recentDrafts,
            latestWorkflow: null
        });

    } catch (error) {
        console.error('대시보드 로딩 오류:', error);
        res.status(500).render('error', { message: '대시보드 로딩 실패', error });
    }
});

module.exports = router;
