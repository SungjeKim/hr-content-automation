# 🚀 배포 가이드

HR 콘텐츠 자동화 시스템의 프로덕션 배포를 위한 완전 가이드입니다.

## 📋 배포 전 체크리스트

### ✅ 필수 준비사항
- [ ] **Node.js 18.0.0 이상** 설치 확인
- [ ] **Claude API 키** 발급 및 크레딧 확인
- [ ] **SSL 인증서** 준비 (HTTPS 환경)
- [ ] **도메인** 설정 및 DNS 구성
- [ ] **방화벽** 포트 3001 개방
- [ ] **프로세스 매니저** (PM2) 설치

### 🔧 시스템 요구사항
- **OS**: Ubuntu 20.04+ / CentOS 7+ / Amazon Linux 2
- **RAM**: 최소 2GB, 권장 4GB
- **Storage**: 최소 10GB 여유 공간
- **CPU**: 최소 2코어 (동시 작업 처리용)
- **Network**: 안정적인 인터넷 연결

## 🏗️ 서버 설정

### 1. 시스템 업데이트
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y

# Amazon Linux
sudo yum update -y
```

### 2. Node.js 설치
```bash
# NodeSource 저장소 추가
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 버전 확인
node --version
npm --version
```

### 3. PM2 프로세스 매니저 설치
```bash
# PM2 전역 설치
sudo npm install -g pm2

# 부팅 시 자동 시작 설정
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
```

### 4. 방화벽 설정
```bash
# UFW 방화벽 (Ubuntu)
sudo ufw allow ssh
sudo ufw allow 3001
sudo ufw enable

# firewalld (CentOS)
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

## 📦 애플리케이션 배포

### 1. 저장소 클론
```bash
# 배포 디렉토리 생성
sudo mkdir -p /opt/hr-content-automation
sudo chown $USER:$USER /opt/hr-content-automation

# 저장소 클론
cd /opt
git clone https://github.com/your-username/hr-content-automation.git
cd hr-content-automation
```

### 2. 의존성 설치
```bash
# 프로덕션 의존성만 설치
npm ci --only=production

# 또는 모든 의존성 설치 후 개발 의존성 제거
npm install
npm prune --production
```

### 3. 환경 설정
```bash
# 환경 변수 파일 생성
cp .env.example .env

# 환경 변수 편집
nano .env
```

**프로덕션 환경 변수 설정:**
```bash
# 필수 설정
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-api-key
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 서버 설정
PORT=3001
HTTPS=true
CORS_ORIGIN=https://yourdomain.com

# 보안 설정
RATE_LIMIT_MAX=50
API_RATE_LIMIT_MAX=10

# 로깅
LOG_LEVEL=warn
LOG_TO_FILE=true

# 스케줄러
SCHEDULER_ENABLED=true
```

### 4. 디렉토리 권한 설정
```bash
# 로그 디렉토리 생성
mkdir -p logs data

# 권한 설정
chmod 755 /opt/hr-content-automation
chmod 600 .env
chmod -R 755 public
chmod -R 644 logs data
```

## 🔄 PM2로 프로세스 관리

### 1. PM2 설정 파일 생성
```bash
# ecosystem.config.js 생성
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'hr-content-automation',
    script: 'production.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
EOF
```

### 2. 애플리케이션 시작
```bash
# PM2로 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 status
pm2 logs hr-content-automation

# 자동 시작 설정 저장
pm2 save
```

### 3. PM2 명령어
```bash
# 상태 확인
pm2 status
pm2 monit

# 로그 확인
pm2 logs hr-content-automation
pm2 logs hr-content-automation --lines 100

# 재시작
pm2 restart hr-content-automation

# 중지/시작
pm2 stop hr-content-automation
pm2 start hr-content-automation

# 삭제
pm2 delete hr-content-automation
```

## 🌐 Nginx 리버스 프록시 설정

### 1. Nginx 설치
```bash
# Ubuntu/Debian
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y
```

### 2. Nginx 설정
```bash
# 설정 파일 생성
sudo nano /etc/nginx/sites-available/hr-content-automation
```

**Nginx 설정 내용:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # HTTP에서 HTTPS로 리디렉션
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL 인증서 설정
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # SSL 보안 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # 보안 헤더
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # 요청 크기 제한
    client_max_body_size 10M;
    
    # 프록시 설정
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Socket.IO 지원
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 정적 파일 캐싱
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://localhost:3001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # 로그 설정
    access_log /var/log/nginx/hr-automation-access.log;
    error_log /var/log/nginx/hr-automation-error.log;
}
```

### 3. Nginx 활성화
```bash
# 사이트 활성화
sudo ln -s /etc/nginx/sites-available/hr-content-automation /etc/nginx/sites-enabled/

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 🔒 SSL 인증서 설정 (Let's Encrypt)

### 1. Certbot 설치
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx -y

# CentOS/RHEL (EPEL 저장소 필요)
sudo yum install epel-release -y
sudo yum install certbot python3-certbot-nginx -y
```

### 2. SSL 인증서 발급
```bash
# 인증서 발급 및 Nginx 자동 설정
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 자동 갱신 설정
sudo crontab -e
# 다음 줄 추가:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 모니터링 설정

### 1. 시스템 모니터링
```bash
# htop 설치 (시스템 리소스 모니터링)
sudo apt install htop -y

# 시스템 상태 확인 스크립트
cat > /opt/hr-content-automation/monitor.sh << 'EOF'
#!/bin/bash
echo "=== HR Content Automation System Monitor ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Memory: $(free -h)"
echo "Disk: $(df -h /)"
echo "PM2 Status:"
pm2 status
echo "Application Health:"
curl -s http://localhost:3001/health | jq
EOF

chmod +x monitor.sh
```

### 2. 로그 로테이션
```bash
# logrotate 설정
sudo nano /etc/logrotate.d/hr-content-automation
```

**로그 로테이션 설정:**
```
/opt/hr-content-automation/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reload hr-content-automation
    endscript
}
```

### 3. 자동 백업 스크립트
```bash
# 백업 스크립트 생성
cat > /opt/hr-content-automation/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/hr-content-automation"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 데이터 백업
tar -czf $BACKUP_DIR/data_$DATE.tar.gz data/

# 로그 백업
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz logs/

# 설정 백업
cp .env $BACKUP_DIR/env_$DATE.backup

# 오래된 백업 삭제 (30일)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.backup" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x backup.sh

# 매일 백업 크론잡 설정
crontab -e
# 다음 줄 추가:
# 0 2 * * * /opt/hr-content-automation/backup.sh >> /opt/hr-content-automation/logs/backup.log 2>&1
```

## 🚨 알림 설정

### 1. 시스템 알림 (Slack/Discord)
```bash
# 알림 스크립트 생성
cat > /opt/hr-content-automation/notify.sh << 'EOF'
#!/bin/bash
WEBHOOK_URL="YOUR_SLACK_WEBHOOK_URL"
MESSAGE="$1"

curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"🤖 HR Content Automation: $MESSAGE\"}" \
    $WEBHOOK_URL
EOF

chmod +x notify.sh
```

### 2. 상태 체크 스크립트
```bash
# 헬스체크 스크립트
cat > /opt/hr-content-automation/healthcheck.sh << 'EOF'
#!/bin/bash
HEALTH_URL="http://localhost:3001/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE != "200" ]; then
    echo "Health check failed: HTTP $RESPONSE"
    ./notify.sh "Health check failed: HTTP $RESPONSE"
    exit 1
fi

echo "Health check passed"
EOF

chmod +x healthcheck.sh

# 5분마다 헬스체크
crontab -e
# 다음 줄 추가:
# */5 * * * * /opt/hr-content-automation/healthcheck.sh >> /opt/hr-content-automation/logs/healthcheck.log 2>&1
```

## 🔄 배포 자동화

### 1. 배포 스크립트
```bash
# 배포 스크립트 생성
cat > /opt/hr-content-automation/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Git pull
git pull origin main

# 의존성 업데이트
npm ci --only=production

# PM2 재시작
pm2 restart hr-content-automation

# 헬스체크
sleep 10
if ./healthcheck.sh; then
    echo "✅ Deployment successful!"
    ./notify.sh "Deployment successful!"
else
    echo "❌ Deployment failed!"
    ./notify.sh "Deployment failed!"
    exit 1
fi
EOF

chmod +x deploy.sh
```

### 2. GitHub Actions (선택사항)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd /opt/hr-content-automation
          ./deploy.sh
```

## 🧪 배포 후 검증

### 1. 기본 검증
```bash
# 서비스 상태 확인
pm2 status
systemctl status nginx

# 헬스체크
curl -s http://localhost:3001/health | jq
curl -s https://yourdomain.com/health | jq

# 메트릭 확인
curl -s http://localhost:3001/metrics

# 로그 확인
pm2 logs hr-content-automation --lines 50
```

### 2. 기능 테스트
```bash
# 테스트 스크립트 실행
npm test

# 개별 기능 테스트
npm run collect    # 기사 수집
npm run analyze    # 브런치 분석
```

### 3. 성능 테스트
```bash
# 부하 테스트 (optional)
# Apache Bench 설치
sudo apt install apache2-utils -y

# 간단한 부하 테스트
ab -n 100 -c 10 https://yourdomain.com/
```

## 🔧 운영 및 유지보수

### 일일 체크리스트
- [ ] PM2 프로세스 상태 확인
- [ ] 헬스체크 엔드포인트 확인
- [ ] 에러 로그 검토
- [ ] 디스크 사용량 확인
- [ ] Claude API 크레딧 잔량 확인

### 주간 체크리스트
- [ ] 전체 로그 검토
- [ ] 백업 파일 확인
- [ ] 보안 업데이트 확인
- [ ] 성능 메트릭 분석

### 월간 체크리스트
- [ ] SSL 인증서 만료일 확인
- [ ] 시스템 업데이트
- [ ] 의존성 보안 검사
- [ ] 백업 복구 테스트

## 🚨 트러블슈팅

### 자주 발생하는 문제

**1. PM2 프로세스가 자꾸 재시작됨**
```bash
# 메모리 사용량 확인
pm2 monit

# 메모리 제한 증가
pm2 delete hr-content-automation
# ecosystem.config.js에서 max_memory_restart 값 증가
pm2 start ecosystem.config.js
```

**2. Nginx 502 Bad Gateway**
```bash
# Node.js 프로세스 확인
pm2 status

# 포트 확인
netstat -tlnp | grep 3001

# Nginx 로그 확인
sudo tail -f /var/log/nginx/hr-automation-error.log
```

**3. SSL 인증서 오류**
```bash
# 인증서 상태 확인
sudo certbot certificates

# 수동 갱신
sudo certbot renew

# Nginx 재시작
sudo systemctl restart nginx
```

**4. 높은 메모리 사용량**
```bash
# Node.js 힙 크기 조정
# ecosystem.config.js에서:
node_args: '--max-old-space-size=2048'

# PM2 재시작
pm2 restart hr-content-automation
```

이 가이드를 따라 배포하면 안정적이고 확장 가능한 HR 콘텐츠 자동화 시스템을 운영할 수 있습니다.