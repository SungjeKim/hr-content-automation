#!/bin/bash

# 현재 날짜
DATE=$(date +"%Y-%m-%d_%H-%M-%S")

# 백업할 디렉토리와 저장 위치
SOURCE_DIR="/home/sungje/hr-content-automation"
BACKUP_DIR="/home/sungje/hr-content-backups"
BACKUP_FILE="$BACKUP_DIR/hr_backup_$DATE.tar.gz"

# 백업 디렉토리 없으면 생성
mkdir -p "$BACKUP_DIR"

# 백업 실행
tar -czvf "$BACKUP_FILE" "$SOURCE_DIR"

# 가장 오래된 백업은 7개만 유지 (원하면 변경 가능)
cd "$BACKUP_DIR"
ls -tp | grep -v '/$' | tail -n +8 | xargs -I {} rm -- {}
