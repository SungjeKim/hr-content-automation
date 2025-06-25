const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');

// 컴포넌트 임포트
const ContentCreationWorkflow = require('./contentCreation');
const QualityChecker = require('../analyzers/qualityChecker');
const ArticleWriter = require('../writers/articleWriter');
const { getJobManager, JobTypes } = require('../jobs/jobManager');

// 워크플로우 상태 정의
const WorkflowStatus = {
    IDLE: 'idle',
    CONTENT_GENERATION: 'content_generation',
    QUALITY_CHECK: 'quality_check',
    USER_REVIEW: 'user_review',
    REVISION_REQUEST: 'revision_request',
    FINAL_APPROVAL: 'final_approval',
    PUBLISH_PREPARATION: 'publish_preparation',
    PUBLISHING: 'publishing',
    PUBLISHED: 'published',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

// 워크플로우 단계 정의
const WorkflowSteps = [
    { id: 'generation', name: '글 생성 및 품질 검증', status: WorkflowStatus.CONTENT_GENERATION },
    { id: 'review', name: '사용자 검토 대기', status: WorkflowStatus.USER_REVIEW },
    { id: 'revision', name: '수정 사항 반영', status: WorkflowStatus.REVISION_REQUEST },
    { id: 'approval', name: '최종 승인 확인', status: WorkflowStatus.FINAL_APPROVAL },
    { id: 'preparation', name: '브런치 업로드 준비', status: WorkflowStatus.PUBLISH_PREPARATION },
    { id: 'publishing', name: '자동 발행 실행', status: WorkflowStatus.PUBLISHING },
    { id: 'verification', name: '발행 결과 확인', status: WorkflowStatus.PUBLISHED }
];

// 사용자 액션 타입
const UserActions = {
    APPROVE: 'approve',
    REJECT: 'reject',
    REQUEST_REVISION: 'request_revision',
    SCHEDULE: 'schedule',
    CANCEL: 'cancel'
};

class PublishingWorkflow extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.id = options.id || `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.status = WorkflowStatus.IDLE;
        this.currentStep = null;
        this.progress = 0;
        
        // 워크플로우 데이터
        this.article = null;
        this.qualityReport = null;
        this.userFeedback = [];
        this.revisionHistory = [];
        this.publishResult = null;
        
        // 설정
        this.config = {
            autoApprove: options.autoApprove || false,
            maxRevisions: options.maxRevisions || 3,
            reviewTimeout: options.reviewTimeout || 86400000, // 24시간
            ...options
        };
        
        // 스케줄링
        this.scheduledTask = null;
        this.scheduledTime = null;
        
        // 생성 시간
        this.createdAt = new Date().toISOString();
        this.startedAt = null;
        this.completedAt = null;
        
        // 데이터 저장 경로
        this.workflowDir = path.join(__dirname, '../../data/workflows');
        this.workflowFile = path.join(this.workflowDir, `${this.id}.json`);
        
        // 이벤트 리스너 설정
        this.setupEventListeners();
    }
    
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 단계별 이벤트 처리
        this.on('step-completed', async (step, result) => {
            await this.handleStepCompleted(step, result);
        });
        
        this.on('step-failed', async (step, error) => {
            await this.handleStepFailed(step, error);
        });
        
        this.on('user-action', async (action, data) => {
            await this.handleUserAction(action, data);
        });
        
        // 진행률 업데이트
        this.on('progress', (progress) => {
            this.progress = progress;
            this.emit('status-changed', {
                workflowId: this.id,
                status: this.status,
                progress: this.progress,
                currentStep: this.currentStep
            });
        });
    }
    
    /**
     * 워크플로우 시작
     */
    async start(options = {}) {
        try {
            console.log(`🚀 Publishing Workflow 시작: ${this.id}`);
            
            this.startedAt = new Date().toISOString();
            await this.updateStatus(WorkflowStatus.CONTENT_GENERATION, 'generation');
            
            // 초기 데이터 저장
            await this.saveWorkflowState();
            
            // Step 1: 글 생성 및 품질 검증
            await this.executeContentGeneration(options);
            
        } catch (error) {
            console.error(`❌ Workflow 시작 실패 (${this.id}):`, error.message);
            await this.handleWorkflowError(error);
        }
    }
    
    /**
     * Step 1: 글 생성 및 품질 검증
     */
    async executeContentGeneration(options = {}) {
        try {
            console.log('📝 Step 1: 글 생성 및 품질 검증 시작');
            this.emit('progress', 10);
            
            // 기존 ContentCreationWorkflow 실행
            const contentOptions = {
                mode: options.mode || 'auto',
                maxArticles: options.maxArticles || 1,
                targetArticleId: options.targetArticleId
            };
            
            const contentResult = await ContentCreationWorkflow.run(contentOptions);
            
            if (!contentResult.success) {
                throw new Error(contentResult.error || '글 생성 실패');
            }
            
            // 생성된 글 중 첫 번째 사용 (또는 지정된 글)
            const generatedArticles = contentResult.articles || [];
            if (generatedArticles.length === 0) {
                throw new Error('생성된 글이 없습니다.');
            }
            
            this.article = generatedArticles[0];
            this.emit('progress', 30);
            
            // 품질 검증
            const qualityChecker = new QualityChecker();
            this.qualityReport = await qualityChecker.checkArticle(this.article);
            
            this.emit('progress', 50);
            
            // Step 1 완료
            this.emit('step-completed', 'generation', {
                article: this.article,
                qualityReport: this.qualityReport
            });
            
        } catch (error) {
            this.emit('step-failed', 'generation', error);
        }
    }
    
    /**
     * Step 2: 사용자 검토 단계
     */
    async executeUserReview() {
        try {
            console.log('👀 Step 2: 사용자 검토 시작');
            await this.updateStatus(WorkflowStatus.USER_REVIEW, 'review');
            this.emit('progress', 60);
            
            // 자동 승인 모드인 경우
            if (this.config.autoApprove) {
                console.log('🤖 자동 승인 모드 - 사용자 검토 건너뛰기');
                
                // 품질 점수 기반 자동 판단
                const qualityScore = this.qualityReport?.scores?.total || 0;
                
                if (qualityScore >= 80) {
                    this.emit('user-action', UserActions.APPROVE, { 
                        reason: 'auto-approve',
                        qualityScore 
                    });
                } else {
                    this.emit('user-action', UserActions.REQUEST_REVISION, { 
                        reason: 'low-quality',
                        qualityScore,
                        feedback: '품질 점수가 낮아 수정이 필요합니다.'
                    });
                }
                
                return;
            }
            
            // 수동 검토 모드 - 사용자 입력 대기
            console.log('⏰ 사용자 검토 대기 중...');
            this.emit('notification', {
                type: 'review-required',
                title: '글 검토 필요',
                message: `"${this.article.title}" 글의 검토가 필요합니다.`,
                workflowId: this.id,
                articleTitle: this.article.title,
                qualityScore: this.qualityReport?.scores?.total || 0,
                actions: [
                    { id: 'approve', label: '승인', type: 'success' },
                    { id: 'revision', label: '수정 요청', type: 'warning' },
                    { id: 'reject', label: '거부', type: 'danger' }
                ]
            });
            
            // 타임아웃 설정
            this.reviewTimeout = setTimeout(() => {
                console.log('⏰ 사용자 검토 시간 초과');
                this.emit('user-action', UserActions.CANCEL, { 
                    reason: 'timeout',
                    message: '검토 시간이 초과되어 워크플로우가 취소되었습니다.'
                });
            }, this.config.reviewTimeout);
            
        } catch (error) {
            this.emit('step-failed', 'review', error);
        }
    }
    
    /**
     * Step 3: 수정 사항 반영
     */
    async executeRevision(feedback) {
        try {
            console.log('✏️ Step 3: 수정 사항 반영 시작');
            await this.updateStatus(WorkflowStatus.REVISION_REQUEST, 'revision');
            this.emit('progress', 40); // 진행률을 다시 낮춤 (수정 단계)
            
            // 수정 횟수 확인
            if (this.revisionHistory.length >= this.config.maxRevisions) {
                throw new Error(`최대 수정 횟수(${this.config.maxRevisions})를 초과했습니다.`);
            }
            
            // 기존 글 백업
            this.revisionHistory.push({
                version: this.revisionHistory.length + 1,
                article: { ...this.article },
                qualityReport: { ...this.qualityReport },
                timestamp: new Date().toISOString(),
                reason: feedback
            });
            
            // AI를 통한 글 재작성
            await this.rewriteArticleWithAI(feedback);
            
            // 재작성된 글 품질 검증
            const qualityChecker = new QualityChecker();
            this.qualityReport = await qualityChecker.checkArticle(this.article);
            
            this.emit('progress', 55);
            
            // 수정 완료 후 다시 사용자 검토로
            this.emit('step-completed', 'revision', {
                article: this.article,
                qualityReport: this.qualityReport,
                revisionCount: this.revisionHistory.length
            });
            
            // 자동으로 사용자 검토 단계로 이동
            await this.executeUserReview();
            
        } catch (error) {
            this.emit('step-failed', 'revision', error);
        }
    }
    
    /**
     * Step 4: 최종 승인 확인
     */
    async executeFinalApproval() {
        try {
            console.log('✅ Step 4: 최종 승인 확인');
            await this.updateStatus(WorkflowStatus.FINAL_APPROVAL, 'approval');
            this.emit('progress', 70);
            
            // 최종 품질 확인
            const finalQualityScore = this.qualityReport?.scores?.total || 0;
            
            if (finalQualityScore < 70) {
                console.log('⚠️ 최종 품질 점수가 낮습니다:', finalQualityScore);
                
                this.emit('notification', {
                    type: 'quality-warning',
                    title: '품질 점수 낮음',
                    message: `품질 점수가 ${finalQualityScore}점입니다. 그래도 발행하시겠습니까?`,
                    workflowId: this.id
                });
            }
            
            // 발행 준비 단계로 이동
            this.emit('step-completed', 'approval', {
                approved: true,
                finalQualityScore
            });
            
        } catch (error) {
            this.emit('step-failed', 'approval', error);
        }
    }
    
    /**
     * Step 5: 브런치 업로드 준비
     */
    async executePublishPreparation() {
        try {
            console.log('🔧 Step 5: 브런치 업로드 준비');
            await this.updateStatus(WorkflowStatus.PUBLISH_PREPARATION, 'preparation');
            this.emit('progress', 80);
            
            // 브런치 형식으로 글 최종 정리
            const brunchArticle = this.prepareBrunchArticle(this.article);
            
            // 백업 생성
            await this.createPublishBackup(brunchArticle);
            
            this.emit('progress', 85);
            
            // 발행 실행 단계로 이동
            this.emit('step-completed', 'preparation', {
                brunchArticle,
                ready: true
            });
            
        } catch (error) {
            this.emit('step-failed', 'preparation', error);
        }
    }
    
    /**
     * Step 6: 자동 발행 실행
     */
    async executePublishing(publishOptions = {}) {
        try {
            console.log('🚀 Step 6: 자동 발행 실행');
            await this.updateStatus(WorkflowStatus.PUBLISHING, 'publishing');
            this.emit('progress', 90);
            
            // Job Manager를 통해 브런치 발행 Job 생성
            const jobManager = getJobManager();
            
            const publishConfig = {
                article: this.article,
                headless: publishOptions.headless !== false,
                autoPublish: publishOptions.autoPublish !== false,
                visibility: publishOptions.visibility || 'public',
                allowComments: publishOptions.allowComments !== false,
                publishNow: publishOptions.publishNow !== false,
                scheduledDate: publishOptions.scheduledDate,
                timeout: publishOptions.timeout || 60000
            };
            
            const publishJob = jobManager.createJob(JobTypes.BRUNCH_PUBLISH, publishConfig);
            await jobManager.enqueueJob(publishJob);
            
            console.log(`📋 브런치 발행 Job 생성: ${publishJob.id}`);
            
            // Job 완료 대기
            const publishResult = await this.waitForJobCompletion(publishJob.id);
            
            if (publishResult.success) {
                this.publishResult = publishResult;
                this.emit('step-completed', 'publishing', publishResult);
            } else {
                throw new Error(publishResult.error || '발행 실패');
            }
            
        } catch (error) {
            this.emit('step-failed', 'publishing', error);
        }
    }
    
    /**
     * Step 7: 발행 결과 확인 및 기록
     */
    async executePublishVerification() {
        try {
            console.log('🔍 Step 7: 발행 결과 확인');
            await this.updateStatus(WorkflowStatus.PUBLISHED, 'verification');
            this.emit('progress', 95);
            
            // 발행된 URL 접근성 확인
            if (this.publishResult?.url) {
                const BrunchPublisher = require('../publishers/brunchPublisher');
                const statusCheck = await BrunchPublisher.checkPublishStatus(this.publishResult.url);
                
                this.publishResult.verification = statusCheck;
            }
            
            // 최종 기록 저장
            await this.savePublishRecord();
            
            // 통계 업데이트
            await this.updateStatistics();
            
            this.completedAt = new Date().toISOString();
            this.emit('progress', 100);
            
            // 성공 알림
            this.emit('notification', {
                type: 'publish-success',
                title: '발행 완료',
                message: `"${this.article.title}" 글이 성공적으로 발행되었습니다.`,
                workflowId: this.id,
                publishedUrl: this.publishResult?.url,
                publishedAt: this.publishResult?.publishedAt
            });
            
            console.log(`✅ Publishing Workflow 완료: ${this.id}`);
            console.log(`📄 발행된 글: ${this.publishResult?.url}`);
            
        } catch (error) {
            this.emit('step-failed', 'verification', error);
        }
    }
    
    /**
     * 사용자 액션 처리
     */
    async handleUserAction(action, data = {}) {
        try {
            console.log(`👤 사용자 액션: ${action}`, data);
            
            // 타임아웃 클리어
            if (this.reviewTimeout) {
                clearTimeout(this.reviewTimeout);
                this.reviewTimeout = null;
            }
            
            // 사용자 피드백 기록
            this.userFeedback.push({
                action,
                data,
                timestamp: new Date().toISOString()
            });
            
            switch (action) {
                case UserActions.APPROVE:
                    await this.executeFinalApproval();
                    break;
                    
                case UserActions.REQUEST_REVISION:
                    await this.executeRevision(data.feedback || '수정 요청');
                    break;
                    
                case UserActions.SCHEDULE:
                    await this.schedulePublishing(data.scheduledTime, data.publishOptions);
                    break;
                    
                case UserActions.REJECT:
                case UserActions.CANCEL:
                    await this.cancelWorkflow(data.reason);
                    break;
                    
                default:
                    console.log(`⚠️ 알 수 없는 사용자 액션: ${action}`);
            }
            
            // 상태 저장
            await this.saveWorkflowState();
            
        } catch (error) {
            console.error('사용자 액션 처리 실패:', error.message);
            await this.handleWorkflowError(error);
        }
    }
    
    /**
     * 발행 스케줄링
     */
    async schedulePublishing(scheduledTime, publishOptions = {}) {
        try {
            console.log(`⏰ 발행 스케줄링: ${scheduledTime}`);
            
            this.scheduledTime = scheduledTime;
            const scheduledDate = new Date(scheduledTime);
            
            if (scheduledDate <= new Date()) {
                throw new Error('스케줄 시간은 현재 시간보다 미래여야 합니다.');
            }
            
            // 크론 표현식 생성
            const cronExpression = this.createCronExpression(scheduledDate);
            
            // 스케줄된 작업 생성
            this.scheduledTask = cron.schedule(cronExpression, async () => {
                console.log(`⏰ 스케줄된 발행 실행: ${this.id}`);
                await this.executePublishPreparation();
            }, {
                scheduled: false,
                timezone: 'Asia/Seoul'
            });
            
            this.scheduledTask.start();
            
            // 알림
            this.emit('notification', {
                type: 'publish-scheduled',
                title: '발행 예약됨',
                message: `"${this.article.title}" 글이 ${scheduledDate.toLocaleString('ko-KR')}에 발행 예약되었습니다.`,
                workflowId: this.id,
                scheduledTime: scheduledTime
            });
            
            await this.updateStatus(WorkflowStatus.FINAL_APPROVAL, 'scheduled');
            
        } catch (error) {
            console.error('발행 스케줄링 실패:', error.message);
            throw error;
        }
    }
    
    /**
     * AI를 통한 글 재작성
     */
    async rewriteArticleWithAI(feedback) {
        try {
            console.log('🤖 AI를 통한 글 재작성 시작');
            
            const articleWriter = new ArticleWriter();
            
            // 재작성 프롬프트 생성
            const rewritePrompt = this.createRewritePrompt(this.article, feedback);
            
            // Claude API를 통한 재작성
            const rewrittenContent = await articleWriter.rewriteWithFeedback(
                this.article,
                feedback,
                rewritePrompt
            );
            
            if (rewrittenContent) {
                // 기존 메타데이터 유지하면서 내용만 업데이트
                this.article = {
                    ...this.article,
                    ...rewrittenContent,
                    revisedAt: new Date().toISOString(),
                    revisionCount: (this.article.revisionCount || 0) + 1
                };
                
                console.log('✅ AI 재작성 완료');
            } else {
                throw new Error('AI 재작성 실패');
            }
            
        } catch (error) {
            console.error('AI 재작성 실패:', error.message);
            
            // 폴백: 기본 수정 안내
            this.article.body += '\n\n[수정 요청 사항]\n' + feedback;
            this.article.revisedAt = new Date().toISOString();
        }
    }
    
    /**
     * 재작성 프롬프트 생성
     */
    createRewritePrompt(article, feedback) {
        return `다음 글을 사용자 피드백에 따라 수정해주세요.

기존 글:
제목: ${article.title}
내용: ${article.body}

사용자 피드백:
${feedback}

요구사항:
1. 피드백을 반영하여 글을 개선해주세요
2. 기존 글의 핵심 메시지는 유지해주세요
3. 브런치 플랫폼에 적합한 형식으로 작성해주세요
4. 한국어로 자연스럽게 작성해주세요

수정된 글을 다음 형식으로 제공해주세요:
---
제목: [수정된 제목]
내용: [수정된 내용]
---`;
    }
    
    /**
     * 브런치 글 형식 준비
     */
    prepareBrunchArticle(article) {
        return {
            ...article,
            // 브런치 형식에 맞게 제목 정리
            title: article.title.replace(/[\[\]]/g, '').trim(),
            
            // 본문에서 불필요한 마크다운 정리
            body: article.body
                .replace(/^#+\s/gm, '') // 헤딩 마크다운 제거
                .replace(/\*\*(.*?)\*\*/g, '$1') // 볼드 마크다운 간소화
                .replace(/\*(.*?)\*/g, '$1') // 이탤릭 마크다운 간소화
                .trim(),
            
            // 해시태그 정리
            hashtags: (article.hashtags || [])
                .map(tag => tag.replace(/^#/, ''))
                .filter(tag => tag.length > 0)
                .slice(0, 10), // 브런치 해시태그 제한
            
            // 메타데이터 추가
            brunchReady: true,
            preparedAt: new Date().toISOString()
        };
    }
    
    /**
     * 단계 완료 처리
     */
    async handleStepCompleted(step, result) {
        try {
            console.log(`✅ Step completed: ${step}`);
            
            // 다음 단계로 진행
            switch (step) {
                case 'generation':
                    await this.executeUserReview();
                    break;
                    
                case 'revision':
                    // 사용자 검토는 executeRevision에서 자동 호출됨
                    break;
                    
                case 'approval':
                    await this.executePublishPreparation();
                    break;
                    
                case 'preparation':
                    // 즉시 발행 또는 스케줄에 따라 처리
                    if (!this.scheduledTime) {
                        await this.executePublishing();
                    }
                    break;
                    
                case 'publishing':
                    await this.executePublishVerification();
                    break;
                    
                case 'verification':
                    // 워크플로우 완료
                    console.log(`🎉 워크플로우 완료: ${this.id}`);
                    break;
            }
            
            // 상태 저장
            await this.saveWorkflowState();
            
        } catch (error) {
            await this.handleWorkflowError(error);
        }
    }
    
    /**
     * 단계 실패 처리
     */
    async handleStepFailed(step, error) {
        console.error(`❌ Step failed: ${step}`, error.message);
        
        // 재시도 로직 (특정 단계에서만)
        const retryableSteps = ['generation', 'publishing'];
        
        if (retryableSteps.includes(step) && !this.retryAttempted) {
            console.log(`🔄 Step 재시도: ${step}`);
            this.retryAttempted = true;
            
            // 잠시 대기 후 재시도
            setTimeout(async () => {
                try {
                    if (step === 'generation') {
                        await this.executeContentGeneration();
                    } else if (step === 'publishing') {
                        await this.executePublishing();
                    }
                } catch (retryError) {
                    await this.handleWorkflowError(retryError);
                }
            }, 5000);
            
            return;
        }
        
        // 재시도 불가능하거나 이미 재시도한 경우 실패 처리
        await this.handleWorkflowError(error);
    }
    
    /**
     * 워크플로우 오류 처리
     */
    async handleWorkflowError(error) {
        try {
            console.error(`💥 워크플로우 오류 (${this.id}):`, error.message);
            
            await this.updateStatus(WorkflowStatus.FAILED, null);
            this.completedAt = new Date().toISOString();
            
            // 오류 알림
            this.emit('notification', {
                type: 'workflow-error',
                title: '워크플로우 실패',
                message: `워크플로우 "${this.id}"에서 오류가 발생했습니다: ${error.message}`,
                workflowId: this.id,
                error: error.message,
                step: this.currentStep
            });
            
            // 상태 저장
            await this.saveWorkflowState();
            
        } catch (saveError) {
            console.error('워크플로우 오류 상태 저장 실패:', saveError.message);
        }
    }
    
    /**
     * 워크플로우 취소
     */
    async cancelWorkflow(reason = 'User cancelled') {
        try {
            console.log(`🚫 워크플로우 취소: ${this.id} - ${reason}`);
            
            // 스케줄된 작업 취소
            if (this.scheduledTask) {
                this.scheduledTask.destroy();
                this.scheduledTask = null;
            }
            
            // 타임아웃 클리어
            if (this.reviewTimeout) {
                clearTimeout(this.reviewTimeout);
                this.reviewTimeout = null;
            }
            
            await this.updateStatus(WorkflowStatus.CANCELLED, null);
            this.completedAt = new Date().toISOString();
            
            // 취소 알림
            this.emit('notification', {
                type: 'workflow-cancelled',
                title: '워크플로우 취소됨',  
                message: `워크플로우 "${this.id}"가 취소되었습니다: ${reason}`,
                workflowId: this.id,
                reason: reason
            });
            
            // 상태 저장
            await this.saveWorkflowState();
            
        } catch (error) {
            console.error('워크플로우 취소 처리 실패:', error.message);
        }
    }
    
    /**
     * 상태 업데이트
     */
    async updateStatus(status, currentStep) {
        this.status = status;
        this.currentStep = currentStep;
        
        // 진행률 계산
        if (currentStep) {
            const stepIndex = WorkflowSteps.findIndex(step => step.id === currentStep);
            if (stepIndex >= 0) {
                this.progress = Math.round(((stepIndex + 1) / WorkflowSteps.length) * 100);
            }
        }
        
        console.log(`📊 워크플로우 상태 업데이트: ${status} (${this.progress}%)`);
        
        this.emit('status-changed', {
            workflowId: this.id,
            status: this.status,
            progress: this.progress,
            currentStep: this.currentStep,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Job 완료 대기
     */
    async waitForJobCompletion(jobId, timeout = 300000) {
        return new Promise((resolve, reject) => {
            const jobManager = getJobManager();
            let checkInterval;
            
            const timeoutId = setTimeout(() => {
                if (checkInterval) clearInterval(checkInterval);
                reject(new Error('Job 완료 대기 시간 초과'));
            }, timeout);
            
            checkInterval = setInterval(() => {
                const job = jobManager.getJob(jobId);
                
                if (!job) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    reject(new Error('Job을 찾을 수 없습니다'));
                    return;
                }
                
                if (job.status === 'completed') {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve(job.result || { success: true });
                } else if (job.status === 'failed') {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve({ success: false, error: job.error });
                }
            }, 2000);
        });
    }
    
    /**
     * 크론 표현식 생성
     */
    createCronExpression(date) {
        const minute = date.getMinutes();
        const hour = date.getHours();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        
        return `${minute} ${hour} ${day} ${month} *`;
    }
    
    /**
     * 발행 백업 생성
     */
    async createPublishBackup(article) {
        try {
            const backupDir = path.join(this.workflowDir, 'backups');
            await fs.ensureDir(backupDir);
            
            const backupFile = path.join(backupDir, `${this.id}-backup.json`);
            const backup = {
                workflowId: this.id,
                article,
                qualityReport: this.qualityReport,
                userFeedback: this.userFeedback,
                revisionHistory: this.revisionHistory,
                timestamp: new Date().toISOString()
            };
            
            await fs.writeJson(backupFile, backup, { spaces: 2 });
            console.log(`💾 발행 백업 생성: ${backupFile}`);
            
        } catch (error) {
            console.error('발행 백업 실패:', error.message);
        }
    }
    
    /**
     * 발행 기록 저장
     */
    async savePublishRecord() {
        try {
            const recordsDir = path.join(this.workflowDir, 'records');
            await fs.ensureDir(recordsDir);
            
            const recordFile = path.join(recordsDir, 'publish-records.json');
            let records = [];
            
            if (await fs.pathExists(recordFile)) {
                records = await fs.readJson(recordFile);
            }
            
            const record = {
                workflowId: this.id,
                title: this.article.title,
                publishedUrl: this.publishResult?.url,
                publishedAt: this.publishResult?.publishedAt,
                qualityScore: this.qualityReport?.scores?.total || 0,
                revisionCount: this.revisionHistory.length,
                executionTime: this.completedAt ? 
                    new Date(this.completedAt) - new Date(this.startedAt) : null,
                success: this.status === WorkflowStatus.PUBLISHED,
                timestamp: new Date().toISOString()
            };
            
            records.push(record);
            
            // 최근 1000개만 보관
            if (records.length > 1000) {
                records = records.slice(-1000);
            }
            
            await fs.writeJson(recordFile, records, { spaces: 2 });
            
        } catch (error) {
            console.error('발행 기록 저장 실패:', error.message);
        }
    }
    
    /**
     * 통계 업데이트
     */
    async updateStatistics() {
        try {
            const statsFile = path.join(this.workflowDir, 'statistics.json');
            let stats = {
                totalWorkflows: 0,
                successfulPublishes: 0,
                failedWorkflows: 0,
                cancelledWorkflows: 0,
                averageQualityScore: 0,
                averageRevisionCount: 0,
                averageExecutionTime: 0,
                lastUpdated: null
            };
            
            if (await fs.pathExists(statsFile)) {
                stats = await fs.readJson(statsFile);
            }
            
            // 통계 업데이트
            stats.totalWorkflows += 1;
            
            if (this.status === WorkflowStatus.PUBLISHED) {
                stats.successfulPublishes += 1;
            } else if (this.status === WorkflowStatus.FAILED) {
                stats.failedWorkflows += 1;
            } else if (this.status === WorkflowStatus.CANCELLED) {
                stats.cancelledWorkflows += 1;
            }
            
            // 평균값 계산 (간단한 이동평균)
            const alpha = 0.1; // 가중치
            
            if (this.qualityReport?.scores?.total) {
                stats.averageQualityScore = stats.averageQualityScore * (1 - alpha) + 
                    this.qualityReport.scores.total * alpha;
            }
            
            stats.averageRevisionCount = stats.averageRevisionCount * (1 - alpha) + 
                this.revisionHistory.length * alpha;
            
            if (this.completedAt && this.startedAt) {
                const executionTime = new Date(this.completedAt) - new Date(this.startedAt);
                stats.averageExecutionTime = stats.averageExecutionTime * (1 - alpha) + 
                    executionTime * alpha;
            }
            
            stats.lastUpdated = new Date().toISOString();
            
            await fs.writeJson(statsFile, stats, { spaces: 2 });
            
        } catch (error) {
            console.error('통계 업데이트 실패:', error.message);
        }
    }
    
    /**
     * 워크플로우 상태 저장
     */
    async saveWorkflowState() {
        try {
            await fs.ensureDir(this.workflowDir);
            
            const state = {
                id: this.id,
                status: this.status,
                currentStep: this.currentStep,
                progress: this.progress,
                article: this.article,
                qualityReport: this.qualityReport,
                userFeedback: this.userFeedback,
                revisionHistory: this.revisionHistory,
                publishResult: this.publishResult,
                scheduledTime: this.scheduledTime,
                config: this.config,
                createdAt: this.createdAt,
                startedAt: this.startedAt,
                completedAt: this.completedAt,
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeJson(this.workflowFile, state, { spaces: 2 });
            
            // 최신 워크플로우로 링크
            const latestFile = path.join(this.workflowDir, 'latest-workflow.json');
            await fs.writeJson(latestFile, state, { spaces: 2 });
            
        } catch (error) {
            console.error('워크플로우 상태 저장 실패:', error.message);
        }
    }
    
    /**
     * 워크플로우 상태 복원
     */
    static async loadWorkflow(workflowId) {
        try {
            const workflowDir = path.join(__dirname, '../../data/workflows');
            const workflowFile = path.join(workflowDir, `${workflowId}.json`);
            
            if (!await fs.pathExists(workflowFile)) {
                return null;
            }
            
            const state = await fs.readJson(workflowFile);
            
            // 새 인스턴스 생성 후 상태 복원
            const workflow = new PublishingWorkflow({ id: workflowId });
            Object.assign(workflow, state);
            
            return workflow;
            
        } catch (error) {
            console.error('워크플로우 로드 실패:', error.message);
            return null;
        }
    }
    
    /**
     * 모든 활성 워크플로우 조회
     */
    static async getActiveWorkflows() {
        try {
            const workflowDir = path.join(__dirname, '../../data/workflows');
            
            if (!await fs.pathExists(workflowDir)) {
                return [];
            }
            
            const files = await fs.readdir(workflowDir);
            const workflowFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('latest-'));
            
            const activeWorkflows = [];
            
            for (const file of workflowFiles) {
                try {
                    const state = await fs.readJson(path.join(workflowDir, file));
                    
                    // 활성 상태인 워크플로우만 포함
                    if (![WorkflowStatus.PUBLISHED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED].includes(state.status)) {
                        activeWorkflows.push(state);
                    }
                } catch (error) {
                    console.error(`워크플로우 파일 읽기 실패: ${file}`, error.message);
                }
            }
            
            return activeWorkflows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
        } catch (error) {
            console.error('활성 워크플로우 조회 실패:', error.message);
            return [];
        }
    }
    
    /**
     * 워크플로우 통계 조회
     */
    static async getStatistics() {
        try {
            const workflowDir = path.join(__dirname, '../../data/workflows');
            const statsFile = path.join(workflowDir, 'statistics.json');
            
            if (!await fs.pathExists(statsFile)) {
                return {
                    totalWorkflows: 0,
                    successfulPublishes: 0,
                    failedWorkflows: 0,
                    cancelledWorkflows: 0,
                    averageQualityScore: 0,
                    averageRevisionCount: 0,
                    averageExecutionTime: 0,
                    successRate: 0
                };
            }
            
            const stats = await fs.readJson(statsFile);
            
            // 성공률 계산
            stats.successRate = stats.totalWorkflows > 0 ? 
                Math.round((stats.successfulPublishes / stats.totalWorkflows) * 100) : 0;
            
            return stats;
            
        } catch (error) {
            console.error('워크플로우 통계 조회 실패:', error.message);
            return null;
        }
    }
    
    /**
     * JSON 직렬화
     */
    toJSON() {
        return {
            id: this.id,
            status: this.status,
            currentStep: this.currentStep,
            progress: this.progress,
            article: this.article ? {
                title: this.article.title,
                wordCount: this.article.body ? this.article.body.length : 0,
                hashtags: this.article.hashtags
            } : null,
            qualityScore: this.qualityReport?.scores?.total || 0,
            revisionCount: this.revisionHistory.length,
            scheduledTime: this.scheduledTime,
            publishedUrl: this.publishResult?.url,
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            executionTime: this.completedAt && this.startedAt ? 
                new Date(this.completedAt) - new Date(this.startedAt) : null
        };
    }
}

// 전역 워크플로우 매니저
class WorkflowManager {
    constructor() {
        this.activeWorkflows = new Map();
    }
    
    /**
     * 새 워크플로우 생성
     */
    createWorkflow(options = {}) {
        const workflow = new PublishingWorkflow(options);
        this.activeWorkflows.set(workflow.id, workflow);
        
        // 워크플로우 완료/실패 시 정리
        workflow.on('status-changed', (data) => {
            if ([WorkflowStatus.PUBLISHED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED].includes(data.status)) {
                setTimeout(() => {
                    this.activeWorkflows.delete(workflow.id);
                }, 60000); // 1분 후 메모리에서 제거
            }
        });
        
        return workflow;
    }
    
    /**
     * 워크플로우 조회
     */
    getWorkflow(workflowId) {
        return this.activeWorkflows.get(workflowId);
    }
    
    /**
     * 모든 활성 워크플로우 조회
     */
    getAllActiveWorkflows() {
        return Array.from(this.activeWorkflows.values());
    }
    
    /**
     * 워크플로우 강제 종료
     */
    async terminateWorkflow(workflowId, reason = 'Force terminated') {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            await workflow.cancelWorkflow(reason);
        }
    }
}

// 싱글톤 매니저
let workflowManager = null;

function getWorkflowManager() {
    if (!workflowManager) {
        workflowManager = new WorkflowManager();
    }
    return workflowManager;
}

module.exports = {
    PublishingWorkflow,
    WorkflowManager,
    getWorkflowManager,
    WorkflowStatus,
    WorkflowSteps,
    UserActions
};