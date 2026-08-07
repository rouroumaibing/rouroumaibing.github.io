# 博客规则

## 目录

- [命名规范](#命名规范)
  - [文章文件名](#文章文件名)
  - [图片目录与文件名](#图片目录与文件名)
  - [文章中引用图片](#文章中引用图片)
- [Front Matter 规范](#front-matter-规范)
- [分类规则](#分类规则)
- [标签规则](#标签规则)

---

## 命名规范

### 文章文件名

```
source/_posts/<分类路径>/<日期>-<5位随机字符>-<英文文章标题>.md
```

- **分类路径**：与 front matter 中 `categories` 的层级一致，支持多级子目录（如 `cncf/kubernetes/`），用于本地文件管理（不影响线上 URL 和分类）
- **日期**：`YYYYMMDD` 格式，如 `20260806`
- **5位随机字符**：小写字母 `a-z`，排除易混淆字符 `l`、`o`，即从 `abcdefghijkmnpqrstuvwxyz` 中选取，用于关联文章与图片
- **英文文章标题**：英文，用 `-` 连接单词，全小写

示例：
- 单层：`source/_posts/github/20260806-hvggd-setup-blog-with-hexo-and-github-actions.md`
- 多层：`source/_posts/cncf/kubernetes/20260806-lidav-pod.md`

### 图片目录与文件名

```
source/images/<日期>/<5位随机字符>/<图片描述>.<扩展名>
```

- **日期**：与文章日期一致，作为文件夹名分组
- **5位随机字符**：与文章的随机字符一致，作为子文件夹关联图片到文章
- **图片描述**：简短描述图片内容，英文，用 `-` 连接单词，全小写
- **扩展名**：支持 `png`、`jpg`、`webp`、`gif`，推荐 `png`（截图）或 `webp`（照片）

示例：`source/images/20260806/hvggd/github-page-setting.png`

### 文章中引用图片

```markdown
![图片描述](/images/<日期>/<5位随机字符>/<图片描述>.<扩展名>)
```

- **alt 文字**：使用中文，简短描述图片内容

示例：

```markdown
![GitHub Pages 设置页面](/images/20260806/hvggd/github-page-setting.png)
```

---

## Front Matter 规范

每篇文章必须包含以下字段：

```yaml
---
title: 文章标题          # 中文，显示在博客页面上
date: YYYY-MM-DD HH:mm:ss  # 如 2026-08-06 10:00:00
tags:                   # 见「标签规则」
  - tag1
categories:             # 见「分类规则」
  - category1
---
```

- **title**：中文标题，显示给读者
- **date**：`YYYY-MM-DD HH:mm:ss` 格式，时区跟随 `_config.yml` 中的 `timezone` 设置
- **tags**：可选，0-5 个
- **categories**：可选，支持单层或多层嵌套

---

## 分类规则

分类（`categories`）用于定义文章的**逻辑归属**，表示从宽到窄的层级关系。

### 命名规范

- 使用英文，PascalCase 首字母大写（如 `CNCF`、`K8s`、`Workload`）
- 专有名词保持官方写法（如 `k8s` 而非 `K8s`，`CNCF` 全大写）
- 分类名一经使用不要随意更改，会影响 URL 路径

### 预定义分类

| 分类 | 说明 | 示例 |
|------|------|------|
| `github` | GitHub 相关 | 仓库管理、Actions、Pages |
| `CNCF` | 云原生生态 | k8s、容器、Service Mesh |
| `Hexo` | 博客框架相关 | 主题、插件、配置 |

> 新分类需在此表登记后再使用，避免同义分类（如 `k8s` 和 `Kubernetes` 不要共存）

### 正确示范（三层嵌套）

如果文章同时属于 `CNCF` 生态、`k8s` 组件、`workload` 资源，**必须**使用以下任一格式：

**格式一（紧凑型，推荐）：**

```yaml
---
title: 你的文章标题
date: 2026-08-06 10:00:00
categories: [CNCF, k8s, workload]
---
```

**格式二（列表型）：**

```yaml
---
title: 你的文章标题
date: 2026-08-06 10:00:00
categories:
  - CNCF
  - k8s
  - workload
---
```

**生成结果**：

- 分类层级：`CNCF` > `k8s` > `workload`
- 访问路径：`/categories/CNCF/k8s/workload/`
- 父级聚合：点击 `CNCF` 分类，该文章**会**显示

### 错误示范（误写为平级）

**绝对禁止**将三层写成三个独立的方括号：

```yaml
---
title: 你的文章标题
# 错误：这代表三个互不相关的独立顶级分类
categories:
  - [CNCF]
  - [k8s]
  - [workload]
---
```

**为什么错？**

- 这会生成三个平级分类：`CNCF`、`k8s`、`workload`
- `k8s` 不会成为 `CNCF` 的子分类，`workload` 不会成为 `k8s` 的子分类
- 访问路径变为：`/categories/CNCF/`、`/categories/k8s/`、`/categories/workload/`（三者互不相干）

---

## 标签规则

标签（`tags`）用于标记文章的**技术关键词**，方便检索和聚合。

### 命名规范

- 使用英文，首字母大写（如 `Hexo`、`GitHub Pages`、`GitHub Actions`）
- 保持与官方名称一致（如 `GitHub Actions` 而非 `github actions`）
- 每篇文章 0-5 个标签，避免过多

### tags vs categories

| | tags | categories |
|------|------|------------|
| 用途 | 技术关键词标记 | 逻辑归属分类 |
| 结构 | 扁平，无层级 | 支持嵌套层级 |
| 数量 | 0-5 个 | 1-3 层 |
| 示例 | `Hexo`, `GitHub Actions` | `[CNCF, k8s, workload]` |

> 简单理解：categories 回答"这篇文章属于什么领域"，tags 回答"这篇文章涉及哪些技术"
