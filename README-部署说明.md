# 8楼私人接待中心管理系统 — 部署说明

## 文件结构

```
8lou-app/
├── backend/
│   ├── server.js       ← 后端服务主文件
│   ├── database.js     ← 数据库初始化
│   └── package.json    ← 依赖配置
└── frontend/
    └── index.html      ← 前端H5页面（单文件）
```

---

## 一、本地测试（电脑上先试试）

### 第一步：安装 Node.js
1. 打开浏览器，访问：https://nodejs.org
2. 点击绿色的 **LTS** 版本下载
3. 双击安装，一路点"下一步"

### 第二步：安装依赖并启动
打开终端（Windows 按 Win+R 输入 cmd，Mac 打开"终端"），输入：

```bash
cd 桌面/8lou-app/backend
npm install
node server.js
```

看到 `✅ 8楼管理系统服务已启动` 就成功了。

### 第三步：手机访问
电脑和手机连接同一个 WiFi，手机浏览器输入：
```
http://电脑IP地址:3000
```
（电脑IP可以在终端输入 `ipconfig`（Windows）或 `ifconfig`（Mac）查看）

---

## 二、正式部署到网上（推荐 Railway，免费）

### 第一步：注册 Railway 账号
1. 访问 https://railway.app
2. 点击 **Start a New Project** → 用 GitHub 账号登录

### 第二步：上传代码到 GitHub
1. 访问 https://github.com，注册账号
2. 点击 **New repository**，名称填 `8lou-app`，点创建
3. 按页面提示上传 `8lou-app` 整个文件夹

### 第三步：在 Railway 部署
1. 登录 Railway，点 **New Project → Deploy from GitHub repo**
2. 选择你的 `8lou-app` 仓库
3. Railway 会自动检测，设置以下内容：
   - **Root Directory**：`backend`
   - **Start Command**：`node server.js`
4. 点 Deploy，等待约1-2分钟

### 第四步：获取访问地址
部署成功后，Railway 会给你一个地址，如：
```
https://8lou-app-production.up.railway.app
```
用手机浏览器打开这个地址即可使用。

---

## 三、更简单的方案（Render，完全免费）

1. 访问 https://render.com，用 GitHub 登录
2. 点 **New → Web Service**
3. 连接你的 GitHub 仓库
4. 配置：
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. 选择 **Free** 套餐，点部署

---

## 四、使用说明

| 功能模块 | 说明 |
|---------|------|
| 🏠 首页 | 快速跳转各功能 |
| 🧬 营养知识 | 按疾病（高血压/糖尿病等）查看饮食建议 |
| 🚦 食物红黄绿灯 | 按红/黄/绿查看食物分类，支持按类别筛选 |
| 📋 申报审批 | 新建接待申报，填写信息后提交，管理员可审批 |
| 📅 预约 | 于总就餐预约 / 接待任务预约，可确认或取消 |
| ✅ 检查打勾 | 接待前/后检查，逐项打勾，保存历史记录 |
| 🍳 厨房安全 | 每日冰箱温度、食材管理、清洁检查记录 |

---

## 五、常见问题

**Q：数据会丢失吗？**
A：数据存在 SQLite 数据库文件（backend/data/app.db），Railway/Render 免费版重启会丢失。如需持久化，可升级付费版或联系技术人员配置持久化存储。

**Q：手机可以直接用吗？**
A：可以，已针对手机优化（H5响应式设计），无需下载App，浏览器直接打开即可。

**Q：多人可以同时使用吗？**
A：可以，后端支持多人并发操作。

**Q：忘记部署地址怎么办？**
A：登录 Railway 或 Render 控制台，在项目页面可以看到访问地址。
