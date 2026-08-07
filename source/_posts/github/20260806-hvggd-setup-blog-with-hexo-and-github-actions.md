---
title: 使用 Hexo + GitHub Actions 搭建个人博客
date: 2026-08-06 10:00:00
tags:
  - Hexo
  - GitHub Blog
categories:
  - github
---

> 本文记录从零开始使用 Hexo + GitHub Actions 搭建个人博客的完整流程。
> 以下命令中 `username` 请替换为你的 GitHub 用户名。

## 1. 前言

[Hexo](https://hexo.io/) 是一个快速、简洁且高效的静态博客框架，支持 Markdown 写作，一键生成静态 HTML 文件。[GitHub Pages](https://pages.github.com/) 提供免费的静态站点托管，配合 [GitHub Actions](https://github.com/features/actions) 可以实现推送即部署的自动化流程。

整体架构：

```
本地写 Markdown → git push → GitHub Actions 自动构建 → 部署到 GitHub Pages
```

## 2. 环境准备

### 安装 Node.js

前往 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。安装完成后验证：

```bash
node -v
# v22.x.x
```

### 安装 pnpm

pnpm 是一个快速、节省磁盘空间的包管理器：

```bash
npm install -g pnpm
pnpm -v
# 11.x.x
```

## 3. 创建 GitHub 仓库

GitHub Pages 有两种类型：

- **User Pages**：仓库名为 `username.github.io`，访问地址为 `https://username.github.io`，只能从 `main` 分支部署
- **Project Pages**：仓库名任意，访问地址为 `https://username.github.io/repo-name`，可从任意分支部署

本文使用 User Pages 方案。前往 GitHub 创建新仓库：

- 仓库名：`username.github.io`
- 可见性：Public
- **不要**勾选 "Add a README file"、"Add .gitignore"、"Choose a license"（保持空仓库）

![GitHub 仓库创建页面](/images/20260806/hvggd/github-page-setting.png)

## 4. 克隆仓库到本地

将空仓库克隆到临时目录（如 `~/Download/`）：

```bash
git clone https://github.com/username/username.github.io.git ~/Download/username.github.io
```

此时 `~/Download/username.github.io/` 是一个空目录，仅包含 `.git` 文件夹，关联了远程仓库。

## 5. 用 Hexo 初始化项目

在工作目录（如 `~/work/`）下用 Hexo 初始化项目：

```bash
# 安装 Hexo CLI
pnpm add -g hexo-cli

# 在 ~/work/ 下初始化项目，项目名与仓库名一致
cd ~/work
hexo init username.github.io
cd username.github.io
pnpm install
```

### 本地预览

```bash
pnpm server
# INFO  Start processing
# INFO  Hexo is running at http://localhost:4000/
```

浏览器打开 `http://localhost:4000/` 即可看到默认博客页面。

### 项目目录结构

```
username.github.io/
├── _config.yml          # 站点配置文件
├── package.json         # 依赖配置
├── source/
│   └── _posts/          # 博客文章（Markdown）
├── scaffolds/           # 文章模板
├── themes/              # 主题文件
└── pnpm-lock.yaml       # 依赖锁定文件
```

## 6. 迁移仓库内容到 Hexo 项目

将克隆下来的 `.git` 目录复制到 Hexo 项目中，使项目关联远程仓库：

```bash
# 将 .git 目录从克隆的仓库复制到 Hexo 项目
cp -r ~/Download/username.github.io/.git ~/work/username.github.io/

# 验证远程关联
cd ~/work/username.github.io
git remote -v
# origin  https://github.com/username/username.github.io.git (fetch)
# origin  https://github.com/username/username.github.io.git (push)
```

完成后可以删除临时目录：

```bash
rm -rf ~/Download/username.github.io
```

## 7. 配置 \_config.yml

编辑项目根目录下的 `_config.yml`，修改以下字段：

### Site 区域

```yaml
# Site
title: 你的博客名称
subtitle: 个人技术博客
description: 你的个人技术博客，记录学习与思考。
keywords: username,博客,blog,技术
author: username
language: zh-CN
timezone: Asia/Shanghai
```

### URL 区域

```yaml
# URL
url: https://username.github.io
```

> `language` 设置为 `zh-CN` 使主题界面显示中文；`timezone` 设置为 `Asia/Shanghai` 确保文章时间戳正确。

## 8. 配置 GitHub Actions 部署工作流

在项目根目录创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

### 关键配置说明

| 配置项                              | 作用                         |
| -------------------------------- | -------------------------- |
| `on.push.branches: main`         | 推送到 main 分支时触发             |
| `workflow_dispatch`              | 支持手动触发                     |
| `permissions: pages: write`      | 授予写入 GitHub Pages 的权限      |
| `permissions: id-token: write`   | OIDC 认证，部署 Pages 必需        |
| `concurrency`                    | 同一时间只允许一个部署，取消旧的进行中部署      |
| `pnpm install --frozen-lockfile` | 严格按照 lockfile 安装，保证 CI 一致性 |
| `actions/deploy-pages@v4`        | 官方部署 Action，直接发布到 Pages    |

### 指定 pnpm 版本

`pnpm/action-setup@v4` 需要知道 pnpm 版本，否则会报错 `No pnpm version is specified`。在 `package.json` 中添加 `packageManager` 字段：

```json
{
  "name": "hexo-site",
  "private": true,
  "packageManager": "pnpm@11.10.0",
  ...
}
```

> 也可在 workflow 的 `Setup pnpm` 步骤中用 `with: version: 11` 指定，但推荐用 `packageManager` 字段，本地和 CI 统一管理。

## 9. 推送到 GitHub

项目自带的 `.gitignore` 已忽略 `public/`、`node_modules/` 等无需提交的文件。直接提交并推送：

```bash
git add .
git commit -m "初始化 Hexo 博客 + GitHub Actions 部署"
git push -u origin main
```

推送后，GitHub Actions 会自动触发构建。

## 10. 配置 GitHub Pages

推送代码后，还需要在 GitHub 上配置 Pages 部署源：

1. 进入仓库页面，点击 **Settings**
2. 左侧菜单选择 **Pages**
3. **Source** 下拉选择 **"GitHub Actions"**（而非 "Deploy from a branch"）

![GitHub Pages 设置](/images/20260806/hvggd/github-page-source-setting.png)

## 11. 验证部署

### 查看 Actions 运行状态

进入仓库 **Actions** 页面，可以看到名为 "Deploy" 的工作流正在运行。等待构建完成后，所有步骤应显示绿色对勾。

### 访问博客

浏览器打开 `https://username.github.io`，即可看到博客首页。


## 12. 开始写文章

### 创建新文章

```bash
hexo new "我的第一篇文章"
# INFO  Created: ~/work/username.github.io/source/_posts/我的第一篇文章.md
```

编辑生成的 Markdown 文件，写入内容。

### 本地预览

```bash
pnpm server
```

确认效果后，推送即可自动部署：

```bash
git add .
git commit -m "发布新文章：我的第一篇文章"
git push
```

推送后 GitHub Actions 会自动构建并更新线上博客。

## 13. 结语

本文完整记录了使用 Hexo + GitHub Actions 搭建个人博客的流程：从创建仓库、初始化项目、配置部署工作流到最终上线。整个方案的优点是：

- **免费**：GitHub Pages 和 Actions 对公开仓库免费
- **自动化**：推送即部署，无需手动操作
- **版本控制**：所有文章和配置都有完整的 Git 历史

后续可以进一步探索：

- 更换主题（如 [NexT](https://theme-next.js.org/)、[Fluid](https://hexo-fluid.github.io/) 等）
- 添加评论系统（如 Giscus、Utterances）
- 配置自定义域名
- 优化 SEO 和站点统计

