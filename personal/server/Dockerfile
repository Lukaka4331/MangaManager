# 使用官方 Node.js 映像檔
FROM node:16

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
#COPY package.json package-lock.json ./
COPY package.json ./

# 安裝依賴
RUN npm install

# 複製所有伺服器端代碼
COPY . .

# 開放伺服器端口
EXPOSE 3000

# 啟動應用
CMD ["node", "server.js"]
