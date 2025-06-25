const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

async function testClaudeAPI() {
    console.log('Claude API 연결 테스트를 시작합니다...\n');
    
    // 환경변수 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
        console.error('오류: ANTHROPIC_API_KEY가 .env 파일에 설정되지 않았습니다.');
        console.log('해결방법: .env 파일에 다음을 추가하세요:');
        console.log('   ANTHROPIC_API_KEY=your_api_key_here\n');
        return;
    }
    
    if (!apiKey.startsWith('sk-ant-api03-')) {
        console.error('오류: API 키 형식이 올바르지 않습니다.');
        console.log('API 키는 "sk-ant-api03-"으로 시작해야 합니다.\n');
        return;
    }
    
    console.log('환경변수 로드 완료');
    console.log(`API 키: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 4)}`);
    
    try {
        // Anthropic 클라이언트 초기화
        const anthropic = new Anthropic({
            apiKey: apiKey,
        });
        
        console.log('Anthropic 클라이언트 초기화 완료');
        console.log('메시지 전송 중...\n');
        
        // 테스트 메시지 전송 (최신 모델 사용)
        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 100,
            messages: [{
                role: 'user',
                content: '안녕하세요! API 연결 테스트입니다.'
            }]
        });
        
        // 성공 응답 처리
        console.log('API 연결 테스트 성공!');
        console.log('응답 정보:');
        console.log(`   - 모델: ${message.model}`);
        console.log(`   - 사용 토큰: ${message.usage.input_tokens} (입력) + ${message.usage.output_tokens} (출력)`);
        console.log(`   - 응답 길이: ${message.content[0].text.length}자`);
        console.log('\nClaude 응답:');
        console.log('-'.repeat(50));
        console.log(message.content[0].text);
        console.log('-'.repeat(50));
        console.log('\n모든 테스트가 완료되었습니다!');
        
    } catch (error) {
        // 에러 상황별 안내
        console.error('API 연결 실패\n');
        
        if (error.status === 401) {
            console.error('인증 오류 (401):');
            console.log('   - API 키가 유효하지 않습니다.');
            console.log('   - .env 파일의 ANTHROPIC_API_KEY를 확인해주세요.');
            console.log('   - Anthropic Console에서 새 API 키를 발급받아보세요.');
        } else if (error.status === 429) {
            console.error('요청 한도 초과 (429):');
            console.log('   - API 사용 한도를 초과했습니다.');
            console.log('   - 잠시 후 다시 시도해주세요.');
            console.log('   - Anthropic Console에서 사용량을 확인해보세요.');
        } else if (error.status === 400) {
            console.error('요청 오류 (400):');
            console.log('   - 요청 형식이 올바르지 않습니다.');
            console.log('   - 모델명이나 파라미터를 확인해주세요.');
        } else if (error.status === 500) {
            console.error('서버 오류 (500):');
            console.log('   - Anthropic 서버에 일시적 문제가 발생했습니다.');
            console.log('   - 잠시 후 다시 시도해주세요.');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.error('네트워크 오류:');
            console.log('   - 인터넷 연결을 확인해주세요.');
            console.log('   - 방화벽 설정을 확인해주세요.');
        } else {
            console.error('알 수 없는 오류:');
            console.log(`   - 상태 코드: ${error.status || 'N/A'}`);
            console.log(`   - 오류 코드: ${error.code || 'N/A'}`);
        }
        
        console.log('\n상세 오류 정보:');
        console.error(error.message);
        
        console.log('\n도움말:');
        console.log('   - Anthropic API 문서: https://docs.anthropic.com/');
        console.log('   - API 키 관리: https://console.anthropic.com/');
        console.log('   - 사용량 확인: https://console.anthropic.com/usage');
    }
}

// 스크립트 실행
if (require.main === module) {
    testClaudeAPI().catch(console.error);
}

module.exports = { testClaudeAPI };