const BrunchPublisher = require('../publishers/brunchPublisher');
const { BaseJob } = require('./jobManager');

/**
 * 브런치 자동 발행 Job
 */
class BrunchPublishJob extends BaseJob {
    constructor(id, config = {}) {
        super(id, 'BrunchPublishJob', config);
        this.publisher = null;
    }
    
    async execute() {
        try {
            console.log(`🚀 브런치 발행 Job 시작: ${this.id}`);
            
            // 발행할 글 정보 확인
            const articleData = this.config.article;
            if (!articleData) {
                throw new Error('발행할 글 정보가 없습니다.');
            }
            
            // 브런치 Publisher 초기화
            this.publisher = new BrunchPublisher({
                headless: this.config.headless !== false,
                autoPublish: this.config.autoPublish === true,
                timeout: this.config.timeout || 60000
            });
            
            // Publisher 초기화
            await this.publisher.initialize();
            
            // 발행 실행
            const publishOptions = {
                visibility: this.config.visibility || 'public',
                allowComments: this.config.allowComments !== false,
                publishNow: this.config.publishNow !== false,
                scheduledDate: this.config.scheduledDate
            };
            
            const result = await this.publisher.publishArticle(articleData, publishOptions);
            
            if (result.success) {
                console.log(`✅ 브런치 발행 성공: ${result.url}`);
                
                return {
                    success: true,
                    url: result.url,
                    publishedAt: result.publishedAt,
                    article: {
                        title: articleData.title,
                        wordCount: articleData.body ? articleData.body.length : 0
                    }
                };
            } else {
                throw new Error(result.error || '브런치 발행 실패');
            }
            
        } catch (error) {
            console.error(`❌ 브런치 발행 Job 실패 (${this.id}):`, error.message);
            throw error;
            
        } finally {
            // Publisher 정리
            if (this.publisher) {
                await this.publisher.cleanup();
            }
        }
    }
    
    async validateResult() {
        return this.result && 
               this.result.success && 
               this.result.url && 
               this.result.publishedAt;
    }
}

module.exports = BrunchPublishJob;