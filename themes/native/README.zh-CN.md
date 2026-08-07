# hexo-theme-native

> [English](README.md) | [中文](README.zh-CN.md)

一个现代的、配置驱动的 Hexo 主题，采用云原生 / 开发者风格的视觉设计。具备吸顶 Mega Menu 导航栏、⌘K 搜索、暗色模式、国际化 (i18n) 和响应式两列博客布局 — 全部基于 Tailwind CSS 构建。

## 预览

### 桌面端（亮色模式）

![桌面端首页](images/preview-home.png)

### 文章详情页

![文章详情](images/preview-post.png)

### 移动端

![移动端](images/preview-mobile.png)

## 快速开始

### 1. 安装主题

克隆到你的 Hexo 站点的 `themes/` 目录：

```bash
cd your-hexo-site
git clone https://github.com/your-repo/hexo-theme-native.git themes/native
```

### 2. 安装主题依赖

```bash
cd themes/native
npm install
```

### 3. 安装必需的 Hexo 插件

在你的 Hexo 站点根目录：

```bash
npm install hexo-renderer-ejs hexo-generator-searchdb hexo-renderer-marked
```

### 4. 配置站点

在站点的 `_config.yml` 中：

```yaml
theme: native

# 搜索插件配置
search:
  path: search.json
  field: post
  content: true
  format: html
```

### 5. 构建 CSS

```bash
cd themes/native
npm run build:css
```

### 6. 运行 Hexo

```bash
hexo server   # 开发模式
hexo generate # 生产构建
```

> **提示：** 主题通过 `generateBefore` 钩子在 `hexo generate` 时自动编译 CSS。如果 `style.css` 已存在且构建失败，将回退使用已有文件。

---

## 站点侧插件依赖

| 插件 | 用途 |
|------|------|
| `hexo-renderer-ejs` | EJS 模板渲染 |
| `hexo-generator-searchdb` | 生成 `search.json` 供 ⌘K 搜索使用 |
| `hexo-renderer-marked` | Markdown 渲染 |

---

## 配置说明

所有配置在 `themes/native/_config.yml` 中。主要配置项：

### 顶部公告条

```yaml
announcement:
  enable: true
  text_key: "announcement_text"          # 语言包中的 i18n key
  link: "/ai-native-infrastructure/"
  link_text_key: "announcement_link_text"
```

设置 `enable: false` 可隐藏公告条。

### 导航栏与 Mega Menu

```yaml
navbar:
  logo: "/images/logo.svg"
  site_name: "我的博客"
  menu:
    - title: "Blog"
      url: "/blog/"
    - title: "技术"              # 下拉菜单项
      type: "dropdown"
      children:
        - name: "AI 工程"
          desc: "LLM、AI 原生基础设施和 Agentic AI。"
          url: "/categories/ai-engineering/"
          icon: "cpu"           # 对应 _partial/icons/cpu.ejs
        - name: "外部链接"
          desc: "在新标签页打开"
          url: "https://example.com"
          external: true
```

可用图标：`cpu`、`server`、`code`。如需添加更多图标，在 `layout/_partial/icons/` 下创建 `<名称>.ejs` 文件，内含 inline SVG。

### 搜索

```yaml
search:
  enable: true
  shortcut: "⌘K"
  path: "search.json"
```

搜索数据为**懒加载** — 仅在用户打开搜索弹窗或访问 `/search/` 页面时才请求，不会在页面加载时下载。

### 暗色模式

```yaml
theme_mode:
  default: "system"  # light | dark | system
```

切换按钮循环顺序：**亮色 → 暗色 → 跟随系统 → 亮色**。偏好保存在 `localStorage` 中。`system` 模式跟随操作系统的 `prefers-color-scheme` 设置。`<head>` 中的内联脚本可防止 FOUC（无样式内容闪烁）。

### 博客列表页

```yaml
blog:
  title: "Blog"
  subtitle: "你的副标题"
  per_page: 10
  show_excerpt: true
  excerpt_length: 160
  reading_time: true
```

### 文章详情页

```yaml
post:
  toc: false  # 全局默认值，可在文章 front-matter 中覆盖
```

为单篇文章启用目录，在 front-matter 中添加 `toc: true`。主题使用 Hexo 原生 `toc()` helper，无需外部插件。当文章没有标题时，布局自动回退为全宽单列。

### 数学公式渲染

```yaml
math:
  enable: false     # 全局开关，文章 front-matter `math: true` 可覆盖
  engine: "mathjax"  # mathjax（推荐）
```

为单篇文章启用公式：

```markdown
---
title: 我的数学文章
math: true
---
```

使用 MathJax 3（通过 CDN 加载），支持 `$...$` 和 `\(...\)` 行内公式语法。

### 侧边栏组件

```yaml
sidebar:
  widgets:
    - categories
    - recent
    - tags
```

数组顺序即为显示顺序。可用组件：`categories`（分类统计）、`recent`（最近文章）、`tags`（标签云）。

### 页脚

```yaml
footer:
  columns:
    - title_key: "footer_nav"          # i18n key
      links:
        - name_key: "footer_blog_posts" # i18n key
          url: "/blog/"
  social_qr:
    - name: "LinkedIn"
      qr_image: "/images/linkedin-qr.png"
      link: "https://linkedin.com/in/you"
  copyright_year: "2024-2026"
  author: "你的名字"
  license: "CC BY 4.0"
  license_url: "https://creativecommons.org/licenses/by/4.0/"
  powered_by:
    - name: "Hexo"
      url: "https://hexo.io"
```

### 多语言 (i18n)

```yaml
i18n:
  enable: true
  default_lang: "zh-CN"
  languages:
    - code: "en"
      name: "English"
    - code: "zh-CN"
      name: "中文"
```

所有面向用户的文案均使用 `languages/en.yml` 和 `languages/zh-CN.yml` 中定义的 i18n key。如需添加新语言，创建 `languages/<代码>.yml` 并将其加入 `languages` 列表。

---

## 自定义

### CSS

编辑 `source/css/input.css` 后重新构建：

```bash
npm run watch:css   # 开发：监听变化自动编译
npm run build:css   # 生产：生成压缩版
```

主题使用 Tailwind CSS 3.4 + `@tailwindcss/typography` 插件（用于文章正文 `.prose` 排版）。自定义组件类（分页器、代码块等）在 `input.css` 的 `@layer components` 中定义。

### 字体

Inter（正文）和 JetBrains Mono（等宽）通过 Google Fonts 在 `head.ejs` 中加载。如需使用本地字体，将字体文件下载到 `source/fonts/`，并将 `<link>` 标签替换为 `input.css` 中的 `@font-face` 声明。

### 配色

主题使用 Tailwind 默认色板。主要颜色：

| 元素 | 亮色模式 | 暗色模式 |
|------|---------|---------|
| 页面背景 | `gray-50` | `gray-950` |
| 卡片背景 | `white` | `gray-900` |
| 正文文字 | `gray-900` | `gray-50` |
| 主题高亮 | `blue-600` | `blue-400` |
| 边框 | `gray-200` | `gray-800` |

---

## 功能特性

- **吸顶导航栏** — 支持 Mega Menu 下拉菜单（hover 展开）
- **⌘K / Ctrl+K 搜索** — 懒加载、键盘可导航（↑↓/Enter/Esc）、XSS 防护
- **暗色模式** — 三态切换（亮色/暗色/跟随系统），无 FOUC，跨标签页同步
- **响应式布局** — `lg`（1024px）以上 8/4 两列网格，移动端单列
- **移动端抽屉** — 滑入式导航，子菜单手风琴折叠，背景滚动锁定，Esc 关闭
- **文章目录** — 从标题自动提取，粘性侧边栏，无标题时自动回退全宽
- **代码块** — 一键复制按钮、行号支持、暗色模式语法高亮
- **国际化** — 内置中英文，可扩展
- **SEO** — Open Graph、Twitter Card、meta 标签、封面图自动提取
- **数学公式** — MathJax 3 按需加载
- **无障碍 (a11y)** — 跳转内容链接、ARIA 属性、键盘导航、焦点管理

---

## 开发

```bash
# 安装依赖
npm install

# 开发时监听 CSS 变化
npm run watch:css

# 构建压缩版 CSS
npm run build:css
```

### 项目结构

```
hexo-theme-native/
├── _config.yml              # 主题配置
├── package.json             # 构建脚本 + 依赖
├── tailwind.config.js       # Tailwind 配置
├── languages/               # 多语言 (en.yml, zh-CN.yml)
├── layout/                  # EJS 模板
│   ├── layout.ejs           # HTML 骨架
│   ├── archive.ejs          # 博客列表页
│   ├── post.ejs             # 文章详情页
│   ├── search.ejs           # 搜索页
│   ├── 404.ejs              # 错误页
│   └── _partial/            # 可复用组件
├── source/
│   ├── css/input.css        # Tailwind 入口
│   ├── js/main.js           # 交互逻辑
│   └── js/search.js         # 搜索逻辑
└── scripts/build-css.js     # 自动构建钩子
```

---

## 许可证

MIT
