# Lunar calendar - Traditional Chinese calendar

>农历-中国传统日历

## Github Actions 自动构建 `calendar.ics`
## Github Pages 每日信息 https://cvmrlut.github.io/Calendar/

## ENV
- docker: `node:24-slim`
- node_version: `v24.18.0`

## 本地构建命令
- 使用容器环境
  ```sh
  docker run --rm -v .:/app -w /app node:24-slim COMMAND
  ```
- COMMAND
  ```sh
  npm install tyme4ts #运行依赖
  npm install -D typescript @types/node #开发依赖
  npm run build #构建
  npx serve dist #本地预览页面 地址 http://localhost:3000
  ```
