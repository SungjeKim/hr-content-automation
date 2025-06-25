#!/usr/bin/env node

/**
 * 스케줄러 테스트 스크립트
 * 사용법: node test-scheduler.js [task_name]
 */

require('dotenv').config();
const { getScheduler } = require('./src/scheduler');

async function testScheduler() {
    console.log('🧪 스케줄러 테스트 시작...\n');
    
    try {
        // 스케줄러 인스턴스 생성
        const scheduler = getScheduler();
        
        // 명령행 인수에서 작업 이름 가져오기
        const taskName = process.argv[2];
        
        if (taskName) {
            // 특정 작업 테스트
            console.log(`📋 작업 테스트: ${taskName}`);
            
            const success = await scheduler.runTask(taskName);
            
            if (success) {
                console.log(`✅ ${taskName} 작업이 성공적으로 완료되었습니다.`);
            } else {
                console.log(`❌ ${taskName} 작업이 실패했습니다.`);
            }
            
        } else {
            // 전체 스케줄러 상태 테스트
            console.log('📊 스케줄러 상태:');
            const status = scheduler.getStatus();
            
            console.log(`실행 상태: ${status.isRunning ? '✅ 실행 중' : '⏸️ 중지됨'}`);
            console.log(`설정: ${JSON.stringify(status.config, null, 2)}`);
            console.log(`통계: ${JSON.stringify(status.stats, null, 2)}`);
            
            console.log('\n📋 등록된 작업들:');
            status.tasks.forEach(task => {
                console.log(`  • ${task.name} (${task.id})`);
                console.log(`    - 스케줄: ${task.cron}`);
                console.log(`    - 활성화: ${task.enabled ? '✅' : '❌'}`);
                console.log(`    - 실행 중: ${task.running ? '🔄' : '⏸️'}`);
                console.log('');
            });
            
            // 사용 가능한 작업 목록 출력
            console.log('💡 특정 작업을 테스트하려면:');
            console.log('   node test-scheduler.js scrapeArticles');
            console.log('   node test-scheduler.js filterArticles');
            console.log('   node test-scheduler.js generateContent');
            console.log('   node test-scheduler.js reanalyzeStyle');
            console.log('   node test-scheduler.js generateReport');
        }
        
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
        if (error.stack) {
            console.error('스택 트레이스:', error.stack);
        }
        process.exit(1);
    }
    
    console.log('\n🎉 테스트 완료!');
    process.exit(0);
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
testScheduler();