#!/usr/bin/env node

/**
 * Job Manager 테스트 스크립트
 * 사용법: node test-job-manager.js [job_type]
 */

require('dotenv').config();
const { getJobManager, JobTypes } = require('./src/jobs/jobManager');

async function testJobManager() {
    console.log('🧪 Job Manager 테스트 시작...\n');
    
    try {
        // Job Manager 인스턴스 생성
        const jobManager = getJobManager({ maxConcurrent: 2 });
        jobManager.start();
        
        // 명령행 인수에서 작업 타입 가져오기
        const jobType = process.argv[2];
        
        if (jobType) {
            // 특정 Job 테스트
            console.log(`📋 Job 테스트: ${jobType}`);
            
            let config = {};
            
            // Job 타입별 설정
            switch (jobType) {
                case 'ARTICLE_COLLECTION':
                    config = { maxRetries: 2 };
                    break;
                case 'CONTENT_ANALYSIS':
                    config = { qualityThreshold: 60, maxArticles: 5 };
                    break;
                case 'ARTICLE_GENERATION':
                    config = { maxArticles: 1 };
                    break;
                case 'STYLE_UPDATE':
                    config = { 
                        targetUrls: ['https://brunch.co.kr/@hr-insight/latest']
                    };
                    break;
                case 'REPORT_GENERATION':
                    config = { reportType: 'weekly', generateHTML: true };
                    break;
            }
            
            const job = jobManager.createJob(JobTypes[jobType], config);
            console.log(`✅ Job 생성됨: ${job.id}`);
            
            await jobManager.enqueueJob(job);
            console.log(`📥 Job 큐에 추가됨`);
            
            // Job 완료 대기
            console.log('⏳ Job 실행 대기 중...');
            
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    const currentJob = jobManager.getJob(job.id);
                    
                    if (currentJob.status === 'completed') {
                        clearInterval(checkInterval);
                        console.log(`✅ Job 완료!`);
                        console.log(`실행 시간: ${(currentJob.executionTime / 1000).toFixed(2)}초`);
                        console.log(`결과:`, JSON.stringify(currentJob.result, null, 2));
                        resolve();
                    } else if (currentJob.status === 'failed') {
                        clearInterval(checkInterval);
                        console.log(`❌ Job 실패: ${currentJob.error}`);
                        resolve();
                    } else {
                        console.log(`상태: ${currentJob.status}...`);
                    }
                }, 2000);
            });
            
        } else {
            // 전체 Job Manager 상태 테스트
            console.log('📊 Job Manager 상태:');
            const status = jobManager.getStatus();
            
            console.log(`실행 상태: ${status.isRunning ? '✅ 실행 중' : '⏸️ 중지됨'}`);
            console.log(`전체 Job 수: ${status.totalJobs}`);
            console.log(`큐 대기: ${status.queueLength}`);
            console.log(`실행 중: ${status.runningJobs}`);
            
            console.log('\n📋 Job 타입:');
            Object.keys(JobTypes).forEach(type => {
                console.log(`  • ${type}: ${JobTypes[type]}`);
            });
            
            // 의존성 테스트 예제
            console.log('\n💡 의존성 테스트 (기사 수집 → 분석 → 생성):');
            
            // 1. 기사 수집
            const collectionJob = jobManager.createJob(JobTypes.ARTICLE_COLLECTION);
            await jobManager.enqueueJob(collectionJob);
            console.log('1️⃣ 기사 수집 Job 추가됨');
            
            // 2. 콘텐츠 분석 (수집 완료 후 자동 실행)
            const analysisJob = jobManager.createJob(JobTypes.CONTENT_ANALYSIS);
            await jobManager.enqueueJob(analysisJob);
            console.log('2️⃣ 콘텐츠 분석 Job 추가됨 (대기 중)');
            
            // 3. 글 생성 (분석 완료 후 자동 실행)
            const generationJob = jobManager.createJob(JobTypes.ARTICLE_GENERATION, { maxArticles: 1 });
            await jobManager.enqueueJob(generationJob);
            console.log('3️⃣ 글 생성 Job 추가됨 (대기 중)');
            
            console.log('\n🔄 Job들이 순차적으로 실행됩니다...');
            
            // 상태 업데이트 모니터링
            const monitor = setInterval(() => {
                const currentStatus = jobManager.getStatus();
                console.log(`[상태] 큐: ${currentStatus.queueLength}, 실행 중: ${currentStatus.runningJobs}`);
                
                if (currentStatus.queueLength === 0 && currentStatus.runningJobs === 0) {
                    clearInterval(monitor);
                    console.log('\n✅ 모든 Job 완료!');
                    
                    // 최종 결과 확인
                    const finalCollection = jobManager.getJob(collectionJob.id);
                    const finalAnalysis = jobManager.getJob(analysisJob.id);
                    const finalGeneration = jobManager.getJob(generationJob.id);
                    
                    console.log(`\n📊 최종 결과:`);
                    console.log(`- 기사 수집: ${finalCollection.status} (${finalCollection.result?.totalArticles || 0}개)`);
                    console.log(`- 콘텐츠 분석: ${finalAnalysis.status} (${finalAnalysis.result?.selectedCount || 0}개 선별)`);
                    console.log(`- 글 생성: ${finalGeneration.status} (${finalGeneration.result?.totalGenerated || 0}개 생성)`);
                }
            }, 3000);
        }
        
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
        if (error.stack) {
            console.error('스택 트레이스:', error.stack);
        }
        process.exit(1);
    }
}

// 프로세스 종료 핸들러
process.on('SIGINT', () => {
    console.log('\n🛑 테스트 중단됨');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('처리되지 않은 Promise 거부:', reason);
    process.exit(1);
});

// 테스트 실행
testJobManager();