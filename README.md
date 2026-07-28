# 构建ICS日历.ics

内容模块化
- 基础干支
- 各家数术算法
  - eg: 奇门遁甲

>当前仅考虑基础每日干支

# 技术栈

兼顾
- Github Actions 自动构建 生成 `calendar.ics`
- Github Pages 静态发布 每日信息

ENV: nodejs
docker: `node:24-slim`
node_version: `v24.18.0`

仓库名：Calendar

# 参考

库选用 https://github.com/6tail/tyme4ts
库文档 https://6tail.cn/tyme.html

# 文件

路径 `C:\Users\root\Documents\git\Calendar\`

```toml
Calendar\
├─ .github\
│  └─ workflows\
│     └─ wf.yml
├─ src\
│  └─ main.ts
├─ .gitignore
├─ tsconfig.json
└─ package.json
```

---

使用命令
```sh
docker run --rm -v .:/app -w /app node:24-slim COMMAND
```

其它
- https://github.com/oooldtoy/chinese_calender
- https://github.com/infinet/lunar-calendar
- https://github.com/OPN48/cnlunar
