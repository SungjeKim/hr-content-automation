echo "백업 시작!"
tar -czvf "$BACKUP_FILE" "$SOURCE_DIR"
echo "백업 완료! 저장 위치: $BACKUP_FILE"
