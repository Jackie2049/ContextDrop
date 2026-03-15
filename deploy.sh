#!/bin/bash
# OmniContext 一键构建部署脚本
# 用法: ./deploy.sh

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="/mnt/c/Users/73523/Desktop"
EXTENSION_NAME="OmniContext"

echo "========================================"
echo "  OmniContext 构建部署脚本"
echo "========================================"

# 切换到项目目录
cd "$PROJECT_DIR"
echo "[1/4] 构建扩展..."
npm run build

echo "[2/4] 删除桌面旧版本..."
rm -rf "$DESKTOP_DIR/$EXTENSION_NAME"

echo "[3/4] 复制新版本到桌面..."
cp -r "$PROJECT_DIR/dist" "$DESKTOP_DIR/$EXTENSION_NAME"

echo "[4/4] 更新 product 目录..."
rm -rf "$PROJECT_DIR/product"
cp -r "$PROJECT_DIR/dist" "$PROJECT_DIR/product"

echo ""
echo "========================================"
echo "  部署完成!"
echo "========================================"
echo ""
echo "扩展位置: $DESKTOP_DIR/$EXTENSION_NAME"
echo ""
echo "下一步操作:"
echo "1. 打开 chrome://extensions/"
echo "2. 点击「加载已解压的扩展程序」"
echo "3. 选择桌面的 $EXTENSION_NAME 文件夹"
echo ""
