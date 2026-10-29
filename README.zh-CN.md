# rouroumaibing.github.io

rouroumaibing 的个人博客，基于 [Hexo](https://hexo.io/) 构建，通过 GitHub Actions 自动部署到 GitHub Pages。

线上地址：<https://rouroumaibing.github.io>

## 文章目录

| 日期         | 文章标题                              | 链接                                                                                                |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-10-29 | AI写代码总卡在细节？根因是隐性知识，不是你描述得不够细 | [访问](https://rouroumaibing.github.io/2026/10/29/ai/20261029-zbenh-ai-automation-tacit-knowledge/) |
| 2026-10-26 | 从 NGINX Ingress 到 Envoy Gateway：一次 Kubernetes 入口架构迁移实践梳理 | [访问](https://rouroumaibing.github.io/2026/10/26/cncf/gateway-api/20261026-fl9q0-nginx-to-envoy-gateway/) |
| 2026-10-15 | 当 AI 学会"按需翻笔记"：一文读懂 Agent 的 Skill | [访问](https://rouroumaibing.github.io/2026/10/15/ai/20261015-ksail-skill-kepu/)                    |
| 2026-08-25 | GatewayAPI 技术架构（PPT版）             | [访问](https://rouroumaibing.github.io/2026/08/25/cncf/gateway-api/20260825-bmqxs-gateway-api/)         |
| 2026-08-25 | envoy-gateway                      | [访问](https://rouroumaibing.github.io/2026/08/25/cncf/gateway-api/20260825-rtzbn-envoy-gateway/)       |
| 2026-08-20 | nginx-gateway-fabric              | [访问](https://rouroumaibing.github.io/2026/08/20/cncf/gateway-api/20260820-mvptk-nginx-gateway-fabric/) |
| 2026-08-18 | Prometheus 技术架构（PPT版）            | [访问](https://rouroumaibing.github.io/2026/08/18/cncf/prometheus/20260818-kpvdn-prometheus-architecture/) |
| 2026-08-18 | Prometheus Operator 入门与实践          | [访问](https://rouroumaibing.github.io/2026/08/18/cncf/prometheus/20260818-nwthc-prometheus-operator-guide/) |
| 2026-08-15 | 什么是 Harness                       | [访问](https://rouroumaibing.github.io/2026/08/15/ai/20260815-qxcvb-harness-core-concepts/)            |
| 2026-08-14 | Agent（智能体）概念梳理                   | [访问](https://rouroumaibing.github.io/2026/08/14/ai/20260814-hkmda-agent-core-concepts/)              |
| 2026-08-07 | 当创建一个 Ingress 后，Kubernetes 会发生什么？ | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-atijk-create-ingress-after/)  |
| 2026-08-07 | 当创建一个 PVC 后，Kubernetes 会发生什么？    | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-bulmn-create-pvc-after/)     |
| 2026-08-07 | Pod                               | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-lidav-pod/)                   |
| 2026-08-07 | 当创建一个 Pod 后，Kubernetes 会发生什么？     | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-loiuj-create-pod-after/)     |
| 2026-08-07 | 当创建一个 StatefulSet 后，Kubernetes 会发生什么？ | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-wkqzm-create-statefulset-after/) |
| 2026-08-07 | 当创建一个 Deployment 后，Kubernetes 会发生什么？ | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-xkqzf-create-deployment-after/) |
| 2026-08-07 | DaemonSet 逻辑结构分析                 | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-xptba-create-daemonset-after/) |
| 2026-08-07 | Job、CronJob 逻辑结构分析               | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-yrcde-create-job-cronjob-after/) |
| 2026-08-07 | 当创建一个 Service 后，Kubernetes 会发生什么？  | [访问](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-zsfgh-create-service-after/)   |
| 2026-08-06 | 使用 Hexo + GitHub Actions 搭建个人博客    | [访问](https://rouroumaibing.github.io/2026/08/06/github/20260806-hvggd-setup-blog-with-hexo-and-github-actions/) |

## 本地运行

```bash
pnpm install      # 安装依赖
pnpm server       # 本地预览 http://localhost:4000
pnpm build        # 生成静态文件
```

> 图片优化由 `hexo-image-opt` 在构建（`pnpm build`）时处理；本地预览（`pnpm server`）已修复图片优化产物引发的无限重生成循环。写作与命名规范见 [source/RULES.md](source/RULES.md)。
