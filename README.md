# Lunar calendar - Traditional Chinese calendar

>农历-中国传统日历

## Github Pages 每日信息 https://cvmrlut.github.io/Calendar/
## Github Actions 自动构建 https://cvmrlut.github.io/Calendar/calendar.ics

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

# 内容模块化
```
.github\workflows\wf.yaml: GitHub_Action 配置文件(每月1日构建一次)
src\
- main.ts: 零依赖的原生模块
  - 设置时区, 获取当前时间
- trans.ts: 转换为中国农历, tyme4ts的所有依赖功能在此处理
  - 每日干支
- ics.ts: ics 生成模块
  - 将转换日历的结果保存为`.ics`文件
  - 时间范围按整年取, 今年+明年+后年
- page.ts: GitHub_Pages 生成模块
  - 遍历显示当前月的转换日历
- 其它profile
```

>其它日历功能逐步加入

# 参考
- https://github.com/6tail?tab=repositories
  - 库选用 https://github.com/6tail/tyme4ts
  - 库文档 https://6tail.cn/tyme.html
- https://github.com/oooldtoy/chinese_calender
- https://github.com/infinet/lunar-calendar
- https://github.com/OPN48/cnlunar
