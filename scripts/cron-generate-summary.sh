#!/bin/bash
# NVM 환경 설정 로드
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

# node 경로 확인 후 실행
node /home/sungje/hr-content-automation/scripts/generate-summary.js
