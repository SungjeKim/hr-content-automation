const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class BrunchPublisher {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        
        // 설정
        this.config = {
            email: process.env.BRUNCH_EMAIL,
            password: process.env.BRUNCH_PASSWORD,
            autoPublish: process.env.AUTO_PUBLISH === 'true',
            headless: process.env.BRUNCH_HEADLESS !== 'false', // 기본값: headless
            timeout: parseInt(process.env.BRUNCH_TIMEOUT) || 30000,
            retryAttempts: parseInt(process.env.BRUNCH_RETRY_ATTEMPTS) || 3,
            ...options
        };
        
        // 브런치 URL들
        this.urls = {
            login: 'https://brunch.co.kr/login',
            write: 'https://brunch.co.kr/write',
            dashboard: 'https://brunch.co.kr/dashboard'
        };
        
        // 백업 디렉토리
        this.backupDir = path.join(__dirname, '../../data/backups');
        
        // 로그인 정보 검증
        if (!this.config.email || !this.config.password) {
            throw new Error('브런치 로그인 정보가 설정되지 않았습니다. BRUNCH_EMAIL과 BRUNCH_PASSWORD를 환경변수에 설정하세요.');
        }
    }
    
    /**
     * 브라우저 초기화
     */
    async initialize() {
        try {
            console.log('🚀 브런치 Publisher 초기화 중...');
            
            // 백업 디렉토리 생성
            await fs.ensureDir(this.backupDir);
            
            // Puppeteer 브라우저 시작
            this.browser = await puppeteer.launch({
                headless: this.config.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                defaultViewport: {
                    width: 1366,
                    height: 768
                }
            });
            
            this.page = await this.browser.newPage();
            
            // User Agent 설정
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            // 타임아웃 설정
            this.page.setDefaultTimeout(this.config.timeout);
            
            console.log('✅ 브라우저 초기화 완료');
            
        } catch (error) {
            console.error('❌ 브라우저 초기화 실패:', error);
            throw error;
        }
    }
    
    /**
     * 브런치 로그인
     */
    async login() {
        try {
            console.log('🔐 브런치 로그인 시도 중...');
            
            // 로그인 페이지로 이동
            await this.page.goto(this.urls.login, { 
                waitUntil: 'networkidle2',
                timeout: this.config.timeout 
            });
            
            // 이미 로그인되어 있는지 확인
            if (await this.checkLoginStatus()) {
                console.log('✅ 이미 로그인되어 있습니다.');
                return true;
            }
            
            // 로그인 폼 대기
            await this.page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
            
            // 이메일 입력
            await this.page.type('input[type="email"], input[name="email"]', this.config.email, { delay: 100 });
            
            // 비밀번호 입력
            await this.page.type('input[type="password"], input[name="password"]', this.config.password, { delay: 100 });
            
            // 로그인 버튼 클릭
            await Promise.all([
                this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: this.config.timeout }),
                this.page.click('button[type="submit"], input[type="submit"], .btn-login')
            ]);
            
            // 2단계 인증 확인
            await this.handle2FA();
            
            // 로그인 성공 확인
            this.isLoggedIn = await this.checkLoginStatus();
            
            if (this.isLoggedIn) {
                console.log('✅ 브런치 로그인 성공');
                
                // 세션 쿠키 저장
                await this.saveSession();
                
                return true;
            } else {
                throw new Error('로그인 실패: 사용자 인증에 실패했습니다.');
            }
            
        } catch (error) {
            console.error('❌ 브런치 로그인 실패:', this.sanitizeError(error.message));
            throw error;
        }
    }
    
    /**
     * 2단계 인증 처리
     */
    async handle2FA() {
        try {
            // 2단계 인증 페이지 감지
            const is2FAPage = await this.page.$('.two-factor, .verification, input[name="code"]');
            
            if (is2FAPage) {
                console.log('⚠️ 2단계 인증이 필요합니다.');
                
                if (!this.config.headless) {
                    // GUI 모드일 때 사용자가 직접 입력하도록 대기
                    console.log('👆 브라우저에서 2단계 인증 코드를 입력해주세요...');
                    
                    // 2단계 인증 완료까지 대기 (최대 5분)
                    await this.page.waitForNavigation({ 
                        waitUntil: 'networkidle2', 
                        timeout: 300000 
                    });
                    
                } else {
                    // headless 모드일 때는 환경변수에서 코드 읽기 (실시간은 불가능)
                    const authCode = process.env.BRUNCH_2FA_CODE;
                    if (authCode) {
                        await this.page.type('input[name="code"]', authCode);
                        await this.page.click('button[type="submit"]');
                        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
                    } else {
                        throw new Error('2단계 인증 코드가 필요합니다. BRUNCH_2FA_CODE 환경변수를 설정하거나 headless 모드를 비활성화하세요.');
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ 2단계 인증 처리 실패:', error.message);
            throw error;
        }
    }
    
    /**
     * 로그인 상태 확인
     */
    async checkLoginStatus() {
        try {
            // 현재 URL이 로그인 페이지가 아니거나, 사용자 정보가 있는지 확인
            const currentUrl = this.page.url();
            
            if (currentUrl.includes('/login')) {
                return false;
            }
            
            // 대시보드나 글쓰기 페이지로 이동해서 확인
            await this.page.goto(this.urls.dashboard, { 
                waitUntil: 'networkidle2',
                timeout: 10000 
            });
            
            // 사용자 정보 또는 글쓰기 버튼 존재 확인
            const userInfo = await this.page.$('.user-info, .profile, .write-button, [href*=\"/write\"]');
            
            return !!userInfo;
            
        } catch (error) {
            console.log('로그인 상태 확인 중 오류:', error.message);
            return false;
        }
    }
    
    /**
     * 세션 저장
     */
    async saveSession() {
        try {
            const cookies = await this.page.cookies();
            const sessionFile = path.join(this.backupDir, 'brunch-session.json');
            
            // 쿠키 암호화하여 저장
            const encryptedCookies = this.encryptData(JSON.stringify(cookies));
            await fs.writeFile(sessionFile, encryptedCookies);
            
            console.log('💾 세션 정보 저장됨');
            
        } catch (error) {
            console.error('세션 저장 실패:', error.message);
        }
    }
    
    /**
     * 세션 복원
     */
    async restoreSession() {
        try {
            const sessionFile = path.join(this.backupDir, 'brunch-session.json');
            
            if (await fs.pathExists(sessionFile)) {
                const encryptedCookies = await fs.readFile(sessionFile, 'utf8');
                const cookies = JSON.parse(this.decryptData(encryptedCookies));
                
                await this.page.setCookie(...cookies);
                console.log('🔄 세션 정보 복원됨');
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('세션 복원 실패:', error.message);
            return false;
        }
    }
    
    /**
     * 글 발행
     */
    async publishArticle(article, options = {}) {
        try {
            console.log(`📝 글 발행 시작: "${article.title}"`);
            
            // 발행 전 백업
            await this.backupArticle(article);
            
            // 브라우저 초기화 (아직 안 했다면)
            if (!this.browser) {
                await this.initialize();
            }
            
            // 세션 복원 시도
            if (!this.isLoggedIn) {
                await this.restoreSession();
                this.isLoggedIn = await this.checkLoginStatus();
            }
            
            // 로그인 (필요한 경우)
            if (!this.isLoggedIn) {
                await this.login();
            }
            
            // 글쓰기 페이지로 이동
            await this.navigateToWritePage();
            
            // 글 내용 입력
            await this.fillArticleContent(article);
            
            // 발행 옵션 설정
            await this.setPublishOptions(options);
            
            // 미리보기 확인 (자동 발행이 아닌 경우)
            if (!this.config.autoPublish) {
                await this.showPreview();
                const approved = await this.waitForUserApproval();
                
                if (!approved) {
                    console.log('❌ 사용자가 발행을 취소했습니다.');
                    return { success: false, reason: 'User cancelled' };
                }
            }
            
            // 발행 실행
            const result = await this.executePublish(options);
            
            if (result.success) {
                console.log(`✅ 글 발행 성공: ${result.url}`);
                
                // 발행 기록 저장
                await this.savePublishRecord(article, result);
                
                return result;
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            console.error('❌ 글 발행 실패:', this.sanitizeError(error.message));
            
            // 실패 시 스크린샷 저장
            await this.saveErrorScreenshot(error);
            
            throw error;
        }
    }
    
    /**
     * 글쓰기 페이지로 이동
     */
    async navigateToWritePage() {
        await this.page.goto(this.urls.write, { 
            waitUntil: 'networkidle2',
            timeout: this.config.timeout 
        });
        
        // 에디터 로딩 대기
        await this.page.waitForSelector('.editor, .write-editor, textarea[name=\"title\"]', { 
            timeout: 15000 
        });
        
        console.log('📝 글쓰기 페이지 로드됨');
    }
    
    /**
     * 글 내용 입력
     */
    async fillArticleContent(article) {
        try {
            console.log('✍️ 글 내용 입력 중...');
            
            // 제목 입력
            const titleSelector = 'input[name=\"title\"], .title-input, .editor-title';
            await this.page.waitForSelector(titleSelector);
            await this.page.click(titleSelector);
            await this.page.keyboard.selectAll();
            await this.page.type(titleSelector, article.title, { delay: 50 });
            
            // 본문 입력
            const contentSelector = 'textarea[name=\"content\"], .editor-content, .write-editor-content';
            
            // 에디터 타입 감지 및 내용 입력
            const editorType = await this.detectEditorType();
            
            if (editorType === 'rich') {
                // 리치 에디터인 경우
                await this.fillRichEditor(article.body);
            } else {
                // 일반 텍스트 에디터인 경우
                await this.page.waitForSelector(contentSelector);
                await this.page.click(contentSelector);
                await this.page.keyboard.selectAll();
                
                // 마크다운을 브런치 형식으로 변환
                const brunchContent = this.convertMarkdownToBrunch(article.body);
                await this.page.type(contentSelector, brunchContent, { delay: 30 });
            }
            
            // 해시태그 추가 (있는 경우)
            if (article.hashtags && article.hashtags.length > 0) {
                await this.addHashtags(article.hashtags);
            }
            
            // 커버 이미지 설정 (있는 경우)
            if (article.coverImage) {
                await this.setCoverImage(article.coverImage);
            }
            
            console.log('✅ 글 내용 입력 완료');
            
        } catch (error) {
            console.error('❌ 글 내용 입력 실패:', error.message);
            throw error;
        }
    }
    
    /**
     * 에디터 타입 감지
     */
    async detectEditorType() {
        try {
            // 리치 에디터 요소 확인
            const richEditor = await this.page.$('.rich-editor, .editor-rich, [contenteditable=\"true\"]');
            
            if (richEditor) {
                return 'rich';
            } else {
                return 'text';
            }
            
        } catch (error) {
            return 'text'; // 기본값
        }
    }
    
    /**
     * 리치 에디터에 내용 입력
     */
    async fillRichEditor(content) {
        try {
            const richEditorSelector = '.rich-editor, .editor-rich, [contenteditable=\"true\"]';
            await this.page.waitForSelector(richEditorSelector);
            
            // 클릭해서 포커스
            await this.page.click(richEditorSelector);
            
            // 기존 내용 삭제
            await this.page.keyboard.selectAll();
            await this.page.keyboard.press('Delete');
            
            // HTML 형식으로 변환된 내용 입력
            const htmlContent = this.convertMarkdownToHTML(content);
            
            await this.page.evaluate((selector, html) => {
                const editor = document.querySelector(selector);
                if (editor) {
                    editor.innerHTML = html;
                    
                    // 커서를 마지막으로 이동
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(editor);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }, richEditorSelector, htmlContent);
            
        } catch (error) {
            console.error('리치 에디터 입력 실패:', error.message);
            throw error;
        }
    }
    
    /**
     * 해시태그 추가
     */
    async addHashtags(hashtags) {
        try {
            console.log('🏷️ 해시태그 추가 중...');
            
            const hashtagSelector = 'input[placeholder*=\"태그\"], .hashtag-input, .tag-input';
            
            for (const tag of hashtags) {
                try {
                    await this.page.waitForSelector(hashtagSelector, { timeout: 5000 });
                    await this.page.type(hashtagSelector, `#${tag.replace('#', '')}`);
                    await this.page.keyboard.press('Enter');
                    
                    // 잠시 대기
                    await this.page.waitForTimeout(500);
                    
                } catch (error) {
                    console.log(`해시태그 "${tag}" 추가 실패:`, error.message);
                }
            }
            
            console.log(`✅ ${hashtags.length}개 해시태그 추가 완료`);
            
        } catch (error) {
            console.error('해시태그 추가 실패:', error.message);
        }
    }
    
    /**
     * 커버 이미지 설정
     */
    async setCoverImage(imagePath) {
        try {
            console.log('🖼️ 커버 이미지 설정 중...');
            
            // 이미지 업로드 버튼 찾기
            const uploadSelector = 'input[type=\"file\"], .image-upload, .cover-image-upload';
            const uploadButton = await this.page.$(uploadSelector);
            
            if (uploadButton) {
                await uploadButton.uploadFile(imagePath);
                
                // 업로드 완료 대기
                await this.page.waitForTimeout(3000);
                
                console.log('✅ 커버 이미지 업로드 완료');
            } else {
                console.log('⚠️ 이미지 업로드 버튼을 찾을 수 없습니다.');
            }
            
        } catch (error) {
            console.error('커버 이미지 설정 실패:', error.message);
        }
    }
    
    /**
     * 발행 옵션 설정
     */
    async setPublishOptions(options = {}) {
        try {
            console.log('⚙️ 발행 옵션 설정 중...');
            
            const defaultOptions = {
                visibility: 'public', // public, private, followers
                allowComments: true,
                publishNow: true,
                scheduledDate: null
            };
            
            const publishOptions = { ...defaultOptions, ...options };
            
            // 공개 범위 설정
            if (publishOptions.visibility !== 'public') {
                await this.setVisibility(publishOptions.visibility);
            }
            
            // 댓글 설정
            if (!publishOptions.allowComments) {
                await this.disableComments();
            }
            
            // 예약 발행 설정
            if (!publishOptions.publishNow && publishOptions.scheduledDate) {
                await this.schedulePublish(publishOptions.scheduledDate);
            }
            
            console.log('✅ 발행 옵션 설정 완료');
            
        } catch (error) {
            console.error('발행 옵션 설정 실패:', error.message);
        }
    }
    
    /**
     * 공개 범위 설정
     */
    async setVisibility(visibility) {
        try {
            const visibilitySelector = '.visibility-option, .privacy-setting';
            const visibilityOptions = await this.page.$$(visibilitySelector);
            
            for (const option of visibilityOptions) {
                const text = await option.evaluate(el => el.textContent);
                
                if (text.includes(visibility === 'private' ? '비공개' : '팔로워')) {
                    await option.click();
                    break;
                }
            }
            
        } catch (error) {
            console.log('공개 범위 설정 실패:', error.message);
        }
    }
    
    /**
     * 댓글 비활성화
     */
    async disableComments() {
        try {
            const commentToggle = await this.page.$('.comment-setting, input[name=\"allowComments\"]');
            
            if (commentToggle) {
                await commentToggle.click();
            }
            
        } catch (error) {
            console.log('댓글 설정 실패:', error.message);
        }
    }
    
    /**
     * 예약 발행 설정
     */
    async schedulePublish(scheduledDate) {
        try {
            // 예약 발행 옵션 선택
            const scheduleOption = await this.page.$('.schedule-option, input[name=\"schedule\"]');
            
            if (scheduleOption) {
                await scheduleOption.click();
                
                // 날짜/시간 입력
                const dateInput = await this.page.$('input[type=\"datetime-local\"], .datetime-picker');
                
                if (dateInput) {
                    const dateString = new Date(scheduledDate).toISOString().slice(0, 16);
                    await dateInput.click();
                    await dateInput.evaluate((el, value) => el.value = value, dateString);
                }
            }
            
        } catch (error) {
            console.log('예약 발행 설정 실패:', error.message);
        }
    }
    
    /**
     * 미리보기 표시
     */
    async showPreview() {
        try {
            console.log('👀 미리보기 확인 중...');
            
            // 미리보기 버튼 클릭
            const previewButton = await this.page.$('.preview-button, .btn-preview');
            
            if (previewButton) {
                await previewButton.click();
                await this.page.waitForTimeout(2000);
            }
            
            // 스크린샷 저장
            const previewPath = path.join(this.backupDir, `preview-${Date.now()}.png`);
            await this.page.screenshot({ 
                path: previewPath,
                fullPage: true 
            });
            
            console.log(`📸 미리보기 스크린샷 저장: ${previewPath}`);
            
        } catch (error) {
            console.log('미리보기 실패:', error.message);
        }
    }
    
    /**
     * 사용자 승인 대기
     */
    async waitForUserApproval() {
        try {
            if (this.config.headless) {
                // headless 모드에서는 환경변수로 제어
                return process.env.AUTO_APPROVE === 'true';
            }
            
            console.log('👆 브라우저에서 발행을 승인하거나 취소해주세요...');
            console.log('   - 발행하려면 발행 버튼을 클릭하세요');
            console.log('   - 취소하려면 브라우저를 닫거나 뒤로 가기를 클릭하세요');
            
            // 사용자 액션 대기 (최대 10분)
            const timeout = 600000; // 10분
            const startTime = Date.now();
            
            while (Date.now() - startTime < timeout) {
                // 페이지가 변경되었거나 발행이 완료되었는지 확인
                const currentUrl = this.page.url();
                
                if (currentUrl.includes('/published') || currentUrl.includes('/article/')) {
                    return true; // 발행 완료
                }
                
                if (currentUrl.includes('/dashboard') || currentUrl.includes('/write')) {
                    // 페이지가 변경됨 - 사용자가 취소했을 가능성
                    const publishButton = await this.page.$('.publish-button, .btn-publish');
                    if (!publishButton) {
                        return false; // 취소됨
                    }
                }
                
                await this.page.waitForTimeout(1000);
            }
            
            throw new Error('사용자 승인 시간이 초과되었습니다.');
            
        } catch (error) {
            console.error('사용자 승인 대기 실패:', error.message);
            return false;
        }
    }
    
    /**
     * 발행 실행
     */
    async executePublish(options = {}) {
        try {
            console.log('🚀 발행 실행 중...');
            
            // 발행 버튼 찾기 및 클릭
            const publishButton = await this.page.$('.publish-button, .btn-publish, button[type=\"submit\"]');
            
            if (!publishButton) {
                throw new Error('발행 버튼을 찾을 수 없습니다.');
            }
            
            // 발행 버튼 클릭
            await Promise.all([
                this.page.waitForNavigation({ 
                    waitUntil: 'networkidle2', 
                    timeout: this.config.timeout 
                }),
                publishButton.click()
            ]);
            
            // 발행 완료 확인
            const publishedUrl = await this.getPublishedUrl();
            
            if (publishedUrl) {
                return {
                    success: true,
                    url: publishedUrl,
                    publishedAt: new Date().toISOString()
                };
            } else {
                // 에러 메시지 확인
                const errorMessage = await this.getErrorMessage();
                
                return {
                    success: false,
                    error: errorMessage || '발행 중 알 수 없는 오류가 발생했습니다.'
                };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 발행된 글 URL 가져오기
     */
    async getPublishedUrl() {
        try {
            // URL 패턴 확인
            const currentUrl = this.page.url();
            
            if (currentUrl.includes('/article/') || currentUrl.includes('/@')) {
                return currentUrl;
            }
            
            // 성공 메시지에서 링크 찾기
            const linkElement = await this.page.$('a[href*=\"/article/\"], a[href*=\"/@\"]');
            
            if (linkElement) {
                return await linkElement.evaluate(el => el.href);
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 에러 메시지 가져오기
     */
    async getErrorMessage() {
        try {
            const errorSelectors = [
                '.error-message',
                '.alert-danger', 
                '.notification-error',
                '.message.error'
            ];
            
            for (const selector of errorSelectors) {
                const errorElement = await this.page.$(selector);
                
                if (errorElement) {
                    return await errorElement.evaluate(el => el.textContent.trim());
                }
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 마크다운을 브런치 형식으로 변환
     */
    convertMarkdownToBrunch(markdown) {
        return markdown
            // 헤딩 변환
            .replace(/^### (.*$)/gim, '$1\n' + '='.repeat(20))
            .replace(/^## (.*$)/gim, '$1\n' + '='.repeat(30))
            .replace(/^# (.*$)/gim, '$1\n' + '='.repeat(40))
            
            // 볼드 변환
            .replace(/\*\*(.*?)\*\*/g, '$1')
            
            // 이탤릭 변환
            .replace(/\*(.*?)\*/g, '$1')
            
            // 링크 변환
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1($2)')
            
            // 리스트 변환
            .replace(/^- (.*$)/gim, '• $1')
            .replace(/^\* (.*$)/gim, '• $1')
            
            // 줄바꿈 정리
            .replace(/\n{3,}/g, '\n\n');
    }
    
    /**
     * 마크다운을 HTML로 변환 (리치 에디터용)
     */
    convertMarkdownToHTML(markdown) {
        return markdown
            // 헤딩 변환
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            
            // 볼드 변환
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            
            // 이탤릭 변환
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            
            // 링크 변환
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href=\"$2\">$1</a>')
            
            // 리스트 변환
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            
            // 문단 변환
            .split('\n\n')
            .map(paragraph => {
                if (paragraph.trim() && !paragraph.includes('<h') && !paragraph.includes('<li>')) {
                    return `<p>${paragraph.trim()}</p>`;
                }
                return paragraph;
            })
            .join('\n\n')
            
            // 리스트 그룹핑
            .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
            .replace(/<\/ul>\s*<ul>/g, '');
    }
    
    /**
     * 글 백업
     */
    async backupArticle(article) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupDir, `article-backup-${timestamp}.json`);
            
            const backup = {
                timestamp,
                article,
                metadata: {
                    brunchEmail: this.config.email,
                    autoPublish: this.config.autoPublish
                }
            };
            
            await fs.writeJson(backupFile, backup, { spaces: 2 });
            console.log(`💾 글 백업 저장: ${backupFile}`);
            
        } catch (error) {
            console.error('글 백업 실패:', error.message);
        }
    }
    
    /**
     * 발행 기록 저장
     */
    async savePublishRecord(article, result) {
        try {
            const recordsFile = path.join(this.backupDir, 'publish-records.json');
            let records = [];
            
            if (await fs.pathExists(recordsFile)) {
                records = await fs.readJson(recordsFile);
            }
            
            records.push({
                timestamp: new Date().toISOString(),
                title: article.title,
                url: result.url,
                success: result.success,
                publishedAt: result.publishedAt
            });
            
            // 최근 100개만 보관
            if (records.length > 100) {
                records = records.slice(-100);
            }
            
            await fs.writeJson(recordsFile, records, { spaces: 2 });
            
        } catch (error) {
            console.error('발행 기록 저장 실패:', error.message);
        }
    }
    
    /**
     * 에러 스크린샷 저장
     */
    async saveErrorScreenshot(error) {
        try {
            if (this.page) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const screenshotPath = path.join(this.backupDir, `error-${timestamp}.png`);
                
                await this.page.screenshot({ 
                    path: screenshotPath,
                    fullPage: true 
                });
                
                console.log(`📸 에러 스크린샷 저장: ${screenshotPath}`);
            }
            
        } catch (screenshotError) {
            console.error('스크린샷 저장 실패:', screenshotError.message);
        }
    }
    
    /**
     * 데이터 암호화
     */
    encryptData(data) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(this.config.email, 'salt', 32);
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipher(algorithm, key);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return iv.toString('hex') + ':' + encrypted;
            
        } catch (error) {
            console.error('데이터 암호화 실패:', error.message);
            return data; // 암호화 실패 시 원본 반환
        }
    }
    
    /**
     * 데이터 복호화
     */
    decryptData(encryptedData) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(this.config.email, 'salt', 32);
            
            const parts = encryptedData.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            const decipher = crypto.createDecipher(algorithm, key);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
            
        } catch (error) {
            console.error('데이터 복호화 실패:', error.message);
            return encryptedData; // 복호화 실패 시 원본 반환
        }
    }
    
    /**
     * 에러 메시지에서 민감정보 제거
     */
    sanitizeError(errorMessage) {
        return errorMessage
            .replace(new RegExp(this.config.email, 'gi'), '[EMAIL]')
            .replace(new RegExp(this.config.password, 'gi'), '[PASSWORD]')
            .replace(/password/gi, '[PASSWORD_FIELD]')
            .replace(/login/gi, '[LOGIN_FIELD]');
    }
    
    /**
     * 리소스 정리
     */
    async cleanup() {
        try {
            if (this.page) {
                await this.page.close();
            }
            
            if (this.browser) {
                await this.browser.close();
            }
            
            console.log('🧹 브라우저 리소스 정리 완료');
            
        } catch (error) {
            console.error('리소스 정리 실패:', error.message);
        }
    }
    
    /**
     * 브런치 발행 상태 확인
     */
    static async checkPublishStatus(url) {
        try {
            const axios = require('axios');
            const response = await axios.head(url);
            
            return {
                accessible: response.status === 200,
                statusCode: response.status
            };
            
        } catch (error) {
            return {
                accessible: false,
                error: error.message
            };
        }
    }
}

module.exports = BrunchPublisher;