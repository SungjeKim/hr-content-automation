require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// 기본 미들웨어만
app.use(express.json());
app.use(express.static('public'));

// 메인 페이지
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>HR 콘텐츠 자동화 시스템</title>
        <meta charset="utf-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 40px; 
                background: #f5f5f5; 
            }
            .container { 
                max-width: 1000px; 
                margin: 0 auto; 
                background: white; 
                padding: 30px; 
                border-radius: 10px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .status { 
                background: #e8f5e8; 
                padding: 20px; 
                border-radius: 8px; 
                margin: 20px 0;
            }
            .feature {
                background: #f0f8ff;
                padding: 15px;
                margin: 10px 0;
                border-left: 4px solid #007bff;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 HR 콘텐츠 자동화 시스템</h1>
            
            <div class="status">
                <h2>✅ 서버가 정상 작동 중입니다!</h2>
                <p><strong>현재 시간:</strong> ${new Date().toLocaleString('ko-KR')}</p>
                <p><strong>서버 포트:</strong> ${PORT}</p>
                <p><strong>환경:</strong> ${process.env.NODE_ENV || 'development'}</p>
                <p><strong>스케줄러:</strong> ${process.env.SCHEDULER_ENABLED === 'false' ? '비활성화 (안전모드)' : '활성화'}</p>
            </div>
            
            <h3>📋 주요 기능</h3>
            <div class="feature">
                <h4>🔍 브런치 스타일 분석</h4>
                <p>기존 글들을 분석하여 개인화된 글쓰기 스타일 학습</p>
            </div>
            
            <div class="feature">
                <h4>📰 HR 기사 자동 수집</h4>
                <p>다양한 HR 매체에서 최신 기사를 자동으로 수집하고 필터링</p>
            </div>
            
            <div class="feature">
                <h4>🤖 AI 글 자동 생성</h4>
                <p>Claude AI를 활용하여 브런치 스타일의 고품질 글 자동 생성</p>
            </div>
            
            <div class="feature">
                <h4>📊 품질 자동 검증</h4>
                <p>생성된 글의 품질을 자동으로 분석하고 점수화</p>
            </div>
            
            <h3>🛠️ 개발 상태</h3>
            <ul>
                <li>✅ Express 서버: 정상 작동</li>
                <li>✅ 환경변수 설정: 완료</li>
                <li>⚠️ 복잡한 기능들: 안정화 작업 중</li>
                <li>🔧 스케줄러: 안전을 위해 비활성화</li>
            </ul>
            
            <h3>🔗 테스트 링크</h3>
            <p><a href="/health">헬스체크</a> | <a href="/status">시스템 상태</a></p>
        </div>
    </body>
    </html>
  `);
});

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: PORT,
    scheduler: process.env.SCHEDULER_ENABLED || 'undefined',
    uptime: process.uptime()
  });
});

// 시스템 상태
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    scheduler_enabled: process.env.SCHEDULER_ENABLED === 'true',
    memory_usage: process.memoryUsage(),
    uptime_seconds: process.uptime()
  });
});

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 간단한 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`🔍 헬스체크: http://localhost:${PORT}/health`);
  console.log(`📊 시스템 상태: http://localhost:${PORT}/status`);
  console.log(`⚙️ 스케줄러: ${process.env.SCHEDULER_ENABLED === 'false' ? '비활성화됨 (안전)' : '설정되지 않음'}`);
});

// 에러 핸들링
process.on('uncaughtException', (err) => {
  console.error('예상치 못한 에러:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 Promise 거부:', reason);
});