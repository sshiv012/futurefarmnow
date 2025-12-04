#!/usr/bin/env bash

# Direct FutureFarmNow Deployment Script
# This script builds the Next.js app and deploys directly to ec-dn server
# Usage: Run this script from the futurefarmnow project root directory
#        bash deploy-direct.sh (recommended)
#        ./deploy-direct.sh (if executable)

set -e  # Exit on any error

# Configuration
EC_HOST="ec-dn"
TEMP_DIR="temp_upload"
TARGET_DIR="/var/www/sites/ffn.cs.ucr.edu/public_html"
BACKUP_SUFFIX="public_html_bak_$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting direct FutureFarmNow deployment...${NC}"

# Check if we're in the right directory
# We need to be in the futurefarmnow project root directory, which should have:
# - ffn-nextjs-app subdirectory with package.json
if [ ! -d "ffn-nextjs-app" ] || [ ! -f "ffn-nextjs-app/package.json" ]; then
    echo -e "${RED}❌ Error: This script must be run from the futurefarmnow project root directory${NC}"
    echo -e "${RED}   Expected structure:${NC}"
    echo -e "${RED}   futurefarmnow/          <- You should be here${NC}"
    echo -e "${RED}   ├── ffn-nextjs-app/     <- Next.js app directory${NC}"
    echo -e "${RED}   └── deploy-direct.sh    <- This script${NC}"
    echo -e "${YELLOW}💡 Current directory: $(pwd)${NC}"
    echo -e "${YELLOW}💡 Try: cd /Users/suryaacharan/Desktop/GIT/ffn/futurefarmnow && bash deploy-direct.sh${NC}"
    exit 1
fi

# Step 1: Build the Next.js application
echo -e "${YELLOW}📦 Building Next.js application...${NC}"
cd ffn-nextjs-app
npm run build

# Check if build was successful
if [ ! -d "out" ]; then
    echo -e "${RED}❌ Error: Build failed - 'out' directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Step 2: Prepare temp directory on ec-dn
echo -e "${YELLOW}🧹 Preparing deployment on ec-dn server...${NC}"
cd ..  # Back to project root

# Clear and recreate temp directory on ec-dn
ssh ${EC_HOST} "rm -rf ${TEMP_DIR} && mkdir -p ${TEMP_DIR}"

echo -e "${GREEN}✅ Temp directory prepared${NC}"

# Step 3: Copy files to ec-dn temp directory
echo -e "${YELLOW}📤 Copying files to ec-dn server...${NC}"
scp -r /Users/suryaacharan/Desktop/GIT/ffn/futurefarmnow/ffn-nextjs-app/out/* ${EC_HOST}:~/${TEMP_DIR}/

echo -e "${GREEN}✅ Files copied to ec-dn server${NC}"

# Step 4: Deploy with backup
echo -e "${YELLOW}🔄 Deploying to production with backup...${NC}"

ssh ${EC_HOST} << EOF
set -e

echo "💾 Creating backup of current deployment..."
if [ -d "${TARGET_DIR}" ] && [ "\$(ls -A ${TARGET_DIR} 2>/dev/null)" ]; then
    sudo cp -r ${TARGET_DIR} ${TARGET_DIR}_${BACKUP_SUFFIX}
    echo "✅ Backup created: ${TARGET_DIR}_${BACKUP_SUFFIX}"
else
    echo "⚠️  Target directory ${TARGET_DIR} is empty or doesn't exist" 
fi

echo "🧹 Clearing current deployment..."
sudo rm -rf ${TARGET_DIR}/*

echo "📁 Ensuring target directory exists..."
sudo mkdir -p ${TARGET_DIR}

echo "📋 Moving files to production location..."
sudo mv ~/${TEMP_DIR}/* ${TARGET_DIR}/

echo "🗑️ Cleaning up temp directory..."
rmdir ~/${TEMP_DIR}

echo "🔄 Restarting web server to apply changes..."
sudo apachectl configtest
sudo systemctl reload httpd
echo "✅ Web server restarted successfully!"

echo "✅ Deployment completed successfully!"
echo "📍 Application is now live at: ${TARGET_DIR}"
EOF

echo -e "${GREEN}🎉 Direct deployment completed successfully!${NC}"
echo -e "${GREEN}📍 Your application is now live on the production server${NC}"
echo -e "${YELLOW}💡 Backup was created with suffix: ${BACKUP_SUFFIX}${NC}"
echo -e "${YELLOW}💡 You can access the application at: https://ffn.cs.ucr.edu${NC}"

# Final verification
echo -e "${YELLOW}🔍 Verifying deployment...${NC}"
ssh ${EC_HOST} "ls -la ${TARGET_DIR} | head -5"

echo -e "${GREEN}✅ Direct deployment complete! 🚀${NC}"