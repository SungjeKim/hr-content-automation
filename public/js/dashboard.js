// 전역 변수
let socket;
let currentTheme = 'light';
let qualityChart;
let currentPreviewArticle = null;
let activityLogCount = 0;

// 초기화 함수
function initializeDashboard() {
    console.log('대시보드 초기화 중...');
    
    // Socket.IO 연결
    connectSocket();
    
    // 테마 설정 로드
    loadTheme();
    
    // 초기 데이터 로드
    loadDashboardData();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 차트 초기화
    initializeCharts();
    
    addLog('시스템이 시작되었습니다.', 'system');
}

// Socket.IO 연결
function connectSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket.IO 연결됨');
        updateSystemStatus('connected');
        addLog('실시간 연결이 설정되었습니다.', 'system');
    });
    
    socket.on('disconnect', () => {
        console.log('Socket.IO 연결 끊김');
        updateSystemStatus('disconnected');
        addLog('실시간 연결이 끊어졌습니다.', 'error');
    });
    
    socket.on('generation-progress', (data) => {
        updateProgress(data);
        addLog(`글 생성: ${data.details.message || data.step}`, 'info');
    });
    
    socket.on('scraping-progress', (data) => {
        addLog(`기사 수집: ${data.message}`, 'info');
    });
    
    socket.on('system-update', (data) => {
        updateSystemStats(data);
        addLog(data.message, 'system');
    });
}

// 현재 시간 업데이트
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    document.getElementById('currentTime').textContent = timeString;
}

// 시스템 상태 업데이트
function updateSystemStatus(status) {
    const indicator = document.getElementById('systemStatus');
    const statusText = indicator.nextElementSibling;
    
    switch (status) {
        case 'connected':
            indicator.style.backgroundColor = '#28a745';
            statusText.textContent = '시스템 정상';
            break;
        case 'disconnected':
            indicator.style.backgroundColor = '#dc3545';
            statusText.textContent = '연결 끊김';
            break;
        case 'processing':
            indicator.style.backgroundColor = '#ffc107';
            statusText.textContent = '처리 중';
            break;
    }
}

// 대시보드 데이터 로드
async function loadDashboardData() {
    try {
        // 추천 기사 로드
        await loadRecommendedArticles();
        
        // 작성된 글 목록 로드
        await loadDraftsList();
        
        // 시스템 통계 로드
        await loadSystemStats();
        
        // 스케줄러 상태 로드
        await loadSchedulerStatus();
        
    } catch (error) {
        console.error('대시보드 데이터 로드 실패:', error);
        showNotification('데이터 로드 중 오류가 발생했습니다.', 'error');
    }
}

// 추천 기사 로드
async function loadRecommendedArticles() {
    try {
        const response = await fetch('/api/articles?filter=filtered&sort=score');
        if (!response.ok) throw new Error('API 응답 오류');
        
        const articles = await response.json();
        const container = document.getElementById('recommendedArticles');
        
        if (!articles || articles.length === 0) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <p class="text-muted">추천 기사가 없습니다.</p>
                    <button class="btn btn-primary btn-sm" onclick="scrapeArticles()">
                        기사 수집하기
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = articles.slice(0, 5).map(article => `
            <div class="article-item fade-in">
                <a href="${article.url}" target="_blank" class="article-title">
                    ${article.title}
                </a>
                <p class="article-summary">
                    ${article.summary ? article.summary.substring(0, 100) + '...' : '요약 없음'}
                </p>
                <div class="article-meta">
                    <span>
                        <i class="fas fa-calendar-alt"></i>
                        ${new Date(article.publishDate).toLocaleDateString('ko-KR')}
                    </span>
                    <span>
                        <i class="fas fa-globe"></i>
                        ${article.source}
                    </span>
                    <span class="score-badge">
                        ${article.relevanceScore || 0}점
                    </span>
                </div>
                <button class="btn btn-primary btn-sm mt-2" 
                        onclick="generateFromArticle('${article.url}', '${article.title.replace(/'/g, "\\'")}')">
                    <i class="fas fa-pen"></i> 글 작성
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('추천 기사 로드 실패:', error);
        document.getElementById('recommendedArticles').innerHTML = `
            <div class="alert alert-danger m-3">
                추천 기사를 불러오는데 실패했습니다.
            </div>
        `;
    }
}

// 작성된 글 목록 로드
async function loadDraftsList() {
    try {
        const response = await fetch('/api/drafts');
        if (!response.ok) throw new Error('API 응답 오류');
        
        const data = await response.json();
        const container = document.getElementById('draftsList');
        
        if (!data || !data.articles || data.articles.length === 0) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="fas fa-file-alt fa-3x text-muted mb-3"></i>
                    <p class="text-muted">작성된 글이 없습니다.</p>
                    <button class="btn btn-info btn-sm" onclick="generateContent()">
                        글 자동생성
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.articles.map(article => {
            const status = getArticleStatus(article);
            const qualityScore = article.qualityScore || 0;
            const qualityClass = getQualityClass(qualityScore);
            
            return `
                <div class="draft-item fade-in" data-status="${status.key}">
                    <div class="draft-title">${article.title}</div>
                    <div class="draft-status">
                        <i class="fas ${status.icon} ${status.class}"></i>
                        <span class="${status.class}">${status.text}</span>
                        <span class="quality-score ${qualityClass} ms-2">
                            <i class="fas fa-star"></i>
                            ${qualityScore}점
                        </span>
                    </div>
                    <div class="small text-muted mb-2">
                        <i class="fas fa-calendar"></i>
                        ${new Date(article.generatedAt).toLocaleDateString('ko-KR')} |
                        <i class="fas fa-file-word"></i>
                        ${article.wordCount}자
                    </div>
                    <div class="draft-actions">
                        <button class="btn btn-outline-primary btn-xs" 
                                onclick="previewArticle('${article.title.replace(/'/g, "\\'")}')">
                            <i class="fas fa-eye"></i> 미리보기
                        </button>
                        <button class="btn btn-outline-secondary btn-xs" 
                                onclick="editArticle('${article.title.replace(/'/g, "\\'")}')">
                            <i class="fas fa-edit"></i> 편집
                        </button>
                        ${status.key === 'passed' ? `
                            <button class="btn btn-outline-success btn-xs" 
                                    onclick="approveArticle('${article.title.replace(/'/g, "\\'")}')">
                                <i class="fas fa-check"></i> 승인
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('글 목록 로드 실패:', error);
        document.getElementById('draftsList').innerHTML = `
            <div class="alert alert-danger m-3">
                글 목록을 불러오는데 실패했습니다.
            </div>
        `;
    }
}

// 시스템 통계 로드
async function loadSystemStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) {
            // API가 없는 경우 기본값 사용
            updateSystemStats({
                totalArticles: 0,
                totalDrafts: 0,
                avgQuality: 0,
                qualityDistribution: { passed: 0, needs_improvement: 0 }
            });
            return;
        }
        
        const stats = await response.json();
        updateSystemStats(stats);
        
    } catch (error) {
        console.error('통계 로드 실패:', error);
        updateSystemStats({
            totalArticles: 0,
            totalDrafts: 0,
            avgQuality: 0,
            qualityDistribution: { passed: 0, needs_improvement: 0 }
        });
    }
}

// 시스템 통계 업데이트
function updateSystemStats(stats) {
    document.getElementById('totalArticles').textContent = stats.totalArticles || 0;
    document.getElementById('totalDrafts').textContent = stats.totalDrafts || 0;
    document.getElementById('avgQuality').textContent = (stats.avgQuality || 0).toFixed(1);
    
    // 품질 차트 업데이트
    if (qualityChart && stats.qualityDistribution) {
        qualityChart.data.datasets[0].data = [
            stats.qualityDistribution.passed || 0,
            stats.qualityDistribution.needs_improvement || 0
        ];
        qualityChart.update();
    }
}

// 기사 상태 판단
function getArticleStatus(article) {
    const score = article.qualityScore || 0;
    
    if (score >= 80) {
        return {
            key: 'passed',
            text: '발행 준비 완료',
            class: 'status-approved',
            icon: 'fa-check-circle'
        };
    } else if (score >= 60) {
        return {
            key: 'review',
            text: '검토 필요',
            class: 'status-review',
            icon: 'fa-clock'
        };
    } else {
        return {
            key: 'needs_improvement',
            text: '개선 필요',
            class: 'status-needs-improvement',
            icon: 'fa-exclamation-triangle'
        };
    }
}

// 품질 점수 클래스 반환
function getQualityClass(score) {
    if (score >= 90) return 'quality-excellent';
    if (score >= 80) return 'quality-good';
    if (score >= 70) return 'quality-average';
    if (score >= 60) return 'quality-poor';
    return 'quality-failed';
}

// 차트 초기화
function initializeCharts() {
    const ctx = document.getElementById('qualityChart').getContext('2d');
    
    qualityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['통과', '개선 필요'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#28a745', '#dc3545'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 필터 버튼 이벤트
    document.querySelectorAll('[data-filter]').forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            filterDrafts(filter);
            
            // 활성 상태 변경
            document.querySelectorAll('[data-filter]').forEach(btn => 
                btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// 글 필터링
function filterDrafts(filter) {
    const items = document.querySelectorAll('.draft-item');
    
    items.forEach(item => {
        const status = item.getAttribute('data-status');
        
        if (filter === 'all' || status === filter) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// 진행 상황 업데이트
function updateProgress(data) {
    const container = document.getElementById('progressContainer');
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    
    if (data.status === 'started') {
        container.classList.remove('d-none');
        bar.style.width = '10%';
        text.textContent = '10%';
    } else if (data.status === 'progress') {
        const progress = Math.min(data.progress || 50, 90);
        bar.style.width = `${progress}%`;
        text.textContent = `${progress}%`;
    } else if (data.status === 'completed') {
        bar.style.width = '100%';
        text.textContent = '100%';
        
        setTimeout(() => {
            container.classList.add('d-none');
            loadDashboardData(); // 데이터 새로고침
        }, 2000);
    } else if (data.status === 'failed') {
        bar.classList.add('bg-danger');
        text.textContent = '실패';
        
        setTimeout(() => {
            container.classList.add('d-none');
            bar.classList.remove('bg-danger');
        }, 3000);
    }
}

// 기사 수집
async function scrapeArticles() {
    if (!confirm('기사 수집을 시작하시겠습니까?')) return;
    
    try {
        updateSystemStatus('processing');
        addLog('기사 수집을 시작합니다...', 'info');
        
        const response = await fetch('/api/scrape', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showNotification(`기사 수집 완료! ${result.totalArticles}개 수집됨`, 'success');
            loadRecommendedArticles();
            loadSystemStats();
        } else {
            showNotification('기사 수집 실패: ' + result.message, 'error');
        }
        
        updateSystemStatus('connected');
        
    } catch (error) {
        console.error('기사 수집 오류:', error);
        showNotification('기사 수집 중 오류가 발생했습니다.', 'error');
        updateSystemStatus('connected');
    }
}

// 글 자동 생성
async function generateContent() {
    if (!confirm('글 자동 생성을 시작하시겠습니까?')) return;
    
    try {
        updateSystemStatus('processing');
        addLog('글 자동 생성을 시작합니다...', 'info');
        
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'auto', maxArticles: 3 })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
        } else {
            showNotification('글 생성 실패: ' + result.message, 'error');
            updateSystemStatus('connected');
        }
        
    } catch (error) {
        console.error('글 생성 오류:', error);
        showNotification('글 생성 중 오류가 발생했습니다.', 'error');
        updateSystemStatus('connected');
    }
}

// 특정 기사로 글 생성
async function generateFromArticle(articleUrl, articleTitle) {
    if (!confirm(`"${articleTitle.substring(0, 50)}..." 기사로 글을 생성하시겠습니까?`)) return;
    
    try {
        updateSystemStatus('processing');
        addLog(`"${articleTitle}" 기사로 글 생성 시작...`, 'info');
        
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                articleUrl: articleUrl,
                mode: 'custom',
                maxArticles: 1 
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
        } else {
            showNotification('글 생성 실패: ' + result.message, 'error');
            updateSystemStatus('connected');
        }
        
    } catch (error) {
        console.error('글 생성 오류:', error);
        showNotification('글 생성 중 오류가 발생했습니다.', 'error');
        updateSystemStatus('connected');
    }
}

// 글 미리보기
async function previewArticle(title) {
    try {
        const response = await fetch(`/api/preview/${encodeURIComponent(title)}`);
        if (!response.ok) throw new Error('미리보기 로드 실패');
        
        const article = await response.json();
        currentPreviewArticle = article;
        
        document.getElementById('previewContent').innerHTML = `
            <div class="mb-3">
                <h4>${article.title}</h4>
                <div class="text-muted small mb-3">
                    작성일: ${new Date(article.generatedAt).toLocaleDateString('ko-KR')} |
                    글자수: ${article.wordCount}자 |
                    품질점수: ${article.qualityScore || 0}점
                </div>
            </div>
            <div class="article-content" style="white-space: pre-wrap; line-height: 1.6;">
                ${article.body}
            </div>
            <div class="mt-3">
                <strong>해시태그:</strong>
                ${article.hashtags ? article.hashtags.map(tag => `<span class="badge bg-secondary me-1">#${tag}</span>`).join('') : ''}
            </div>
        `;
        
        const modal = new bootstrap.Modal(document.getElementById('previewModal'));
        modal.show();
        
    } catch (error) {
        console.error('미리보기 오류:', error);
        showNotification('미리보기를 불러오는데 실패했습니다.', 'error');
    }
}

// 글 편집
function editArticle(title) {
    if (currentPreviewArticle) {
        document.getElementById('editTitle').value = currentPreviewArticle.title;
        document.getElementById('editContent').value = currentPreviewArticle.body;
        document.getElementById('editHashtags').value = currentPreviewArticle.hashtags ? 
            currentPreviewArticle.hashtags.map(tag => `#${tag}`).join(' ') : '';
        
        const modal = new bootstrap.Modal(document.getElementById('editModal'));
        modal.show();
    } else {
        showNotification('편집할 글 정보를 불러오는 중입니다...', 'info');
        previewArticle(title).then(() => editArticle(title));
    }
}

// 편집 저장
async function saveEdit() {
    try {
        const title = document.getElementById('editTitle').value;
        const content = document.getElementById('editContent').value;
        const hashtags = document.getElementById('editHashtags').value;
        
        // 여기에 저장 API 호출 코드 추가
        // await fetch('/api/edit', { ... });
        
        showNotification('글이 저장되었습니다.', 'success');
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('editModal'));
        modal.hide();
        
        loadDraftsList();
        
    } catch (error) {
        console.error('저장 오류:', error);
        showNotification('저장 중 오류가 발생했습니다.', 'error');
    }
}

// 글 승인
async function approveArticle(title) {
    if (!title && currentPreviewArticle) {
        title = currentPreviewArticle.title;
    }
    
    if (!confirm(`"${title}"을 승인하시겠습니까?`)) return;
    
    try {
        const response = await fetch(`/approve/${encodeURIComponent(title)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: '관리자 승인' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('글이 승인되었습니다!', 'success');
            loadDraftsList();
            addLog(`"${title}" 글이 승인되었습니다.`, 'success');
        } else {
            showNotification('승인 실패: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('승인 오류:', error);
        showNotification('승인 중 오류가 발생했습니다.', 'error');
    }
}

// 데이터 새로고침
function refreshArticles() {
    addLog('데이터를 새로고침합니다...', 'info');
    loadRecommendedArticles();
    loadDraftsList();
    loadSystemStats();
}

// 테마 토글
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(currentTheme);
    localStorage.setItem('dashboard-theme', currentTheme);
    
    const icon = document.getElementById('themeIcon');
    icon.className = currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    
    addLog(`${currentTheme === 'dark' ? '다크' : '라이트'} 테마로 변경되었습니다.`, 'info');
}

// 테마 적용
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

// 테마 로드
function loadTheme() {
    const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
    
    const icon = document.getElementById('themeIcon');
    icon.className = currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// 알림 표시
function showNotification(message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    const toastBody = document.getElementById('toastMessage');
    
    // 타입에 따른 스타일 변경
    toast.className = `toast ${type === 'error' ? 'bg-danger text-white' : 
                              type === 'success' ? 'bg-success text-white' : 
                              'bg-primary text-white'}`;
    
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// 활동 로그 추가
function addLog(message, type = 'info') {
    const container = document.getElementById('activityLog');
    const now = new Date();
    const timeString = now.toLocaleTimeString('ko-KR');
    
    const icons = {
        'info': 'fa-info-circle text-primary',
        'success': 'fa-check-circle text-success',
        'error': 'fa-exclamation-circle text-danger',
        'system': 'fa-cog text-secondary'
    };
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item slide-in';
    logItem.innerHTML = `
        <div class="log-icon">
            <i class="fas ${icons[type] || icons.info}"></i>
        </div>
        <div class="log-time">${timeString}</div>
        <div class="log-message">${message}</div>
    `;
    
    container.insertBefore(logItem, container.firstChild);
    
    // 로그 개수 제한 (최대 50개)
    if (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
    
    activityLogCount++;
}

// 스케줄러 상태 로드
async function loadSchedulerStatus() {
    try {
        const response = await fetch('/api/scheduler/status');
        
        if (!response.ok) {
            throw new Error('스케줄러 상태 조회 실패');
        }
        
        const status = await response.json();
        updateSchedulerUI(status);
        
    } catch (error) {
        console.error('스케줄러 상태 로드 실패:', error);
        document.getElementById('schedulerStatus').innerHTML = 
            '<span class="badge bg-danger">오프라인</span>';
    }
}

// 스케줄러 UI 업데이트
function updateSchedulerUI(status) {
    const statusElement = document.getElementById('schedulerStatus');
    
    if (status.isRunning) {
        statusElement.innerHTML = '<span class="badge bg-success">실행 중</span>';
        document.getElementById('startScheduler').disabled = true;
        document.getElementById('stopScheduler').disabled = false;
    } else {
        statusElement.innerHTML = '<span class="badge bg-warning">중지됨</span>';
        document.getElementById('startScheduler').disabled = false;
        document.getElementById('stopScheduler').disabled = true;
    }
    
    // 통계 정보 추가
    if (status.stats) {
        const statsHtml = `
            <div class="small text-muted mt-2">
                총 실행: ${status.stats.totalExecutions}회 | 
                성공률: ${status.stats.totalExecutions > 0 ? 
                    Math.round((status.stats.successCount / status.stats.totalExecutions) * 100) : 0}%
            </div>
        `;
        statusElement.innerHTML += statsHtml;
    }
}

// 스케줄러 제어
async function controlScheduler(action) {
    try {
        const response = await fetch(`/api/scheduler/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            loadSchedulerStatus(); // 상태 새로고침
            addLog(`스케줄러 ${action === 'start' ? '시작' : '중지'}됨`, 'system');
        } else {
            showNotification('스케줄러 제어 실패: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('스케줄러 제어 오류:', error);
        showNotification('스케줄러 제어 중 오류가 발생했습니다.', 'error');
    }
}

// 스케줄 작업 수동 실행
async function runTask(taskId) {
    if (!confirm(`${taskId} 작업을 수동으로 실행하시겠습니까?`)) return;
    
    try {
        updateSystemStatus('processing');
        addLog(`${taskId} 작업 수동 실행 시작...`, 'info');
        
        const response = await fetch(`/api/scheduler/run/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
            addLog(`${taskId} 작업 완료`, 'success');
            
            // 관련 데이터 새로고침
            if (taskId === 'scrapeArticles') {
                loadRecommendedArticles();
            } else if (taskId === 'generateContent') {
                loadDraftsList();
            }
            loadSystemStats();
        } else {
            showNotification('작업 실행 실패: ' + result.message, 'error');
            addLog(`${taskId} 작업 실패`, 'error');
        }
        
        updateSystemStatus('connected');
        
    } catch (error) {
        console.error('작업 실행 오류:', error);
        showNotification('작업 실행 중 오류가 발생했습니다.', 'error');
        updateSystemStatus('connected');
    }
}

// 실시간 업데이트 시작
function startRealTimeUpdates() {
    // 5분마다 데이터 새로고침
    setInterval(() => {
        loadSystemStats();
        loadSchedulerStatus();
    }, 5 * 60 * 1000);
    
    // 30초마다 추천 기사 확인
    setInterval(() => {
        if (Math.random() < 0.1) { // 10% 확률로 새 기사 체크
            loadRecommendedArticles();
        }
    }, 30 * 1000);
}