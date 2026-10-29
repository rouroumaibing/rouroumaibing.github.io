# rouroumaibing.github.io

rouroumaibing's personal blog, built with [Hexo](https://hexo.io/) and auto-deployed to GitHub Pages via GitHub Actions.

Live site: <https://rouroumaibing.github.io>

## Posts

| Date       | Title                                                            | Link                                                                                              |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-10-29 | AI Writes Code and Always Hits the Details? The Root Cause Is Tacit Knowledge, Not That You Didn't Describe It Well Enough | [View](https://rouroumaibing.github.io/2026/10/29/ai/20261029-zbenh-ai-automation-tacit-knowledge/) |
| 2026-10-26 | From NGINX Ingress to Envoy Gateway: A Kubernetes Ingress Migration in Practice | [View](https://rouroumaibing.github.io/2026/10/26/cncf/gateway-api/20261026-fl9q0-nginx-to-envoy-gateway/) |
| 2026-10-15 | When AI Learns to "Look Up Notes on Demand": Understanding Agent Skills | [View](https://rouroumaibing.github.io/2026/10/15/ai/20261015-ksail-skill-kepu/)                  |
| 2026-08-25 | GatewayAPI Technical Architecture (PPT Edition)                 | [View](https://rouroumaibing.github.io/2026/08/25/cncf/gateway-api/20260825-bmqxs-gateway-api/)   |
| 2026-08-25 | envoy-gateway                                                   | [View](https://rouroumaibing.github.io/2026/08/25/cncf/gateway-api/20260825-rtzbn-envoy-gateway/) |
| 2026-08-20 | nginx-gateway-fabric                                           | [View](https://rouroumaibing.github.io/2026/08/20/cncf/gateway-api/20260820-mvptk-nginx-gateway-fabric/) |
| 2026-08-18 | Prometheus Technical Architecture (PPT Edition)                | [View](https://rouroumaibing.github.io/2026/08/18/cncf/prometheus/20260818-kpvdn-prometheus-architecture/) |
| 2026-08-18 | Getting Started with Prometheus Operator                       | [View](https://rouroumaibing.github.io/2026/08/18/cncf/prometheus/20260818-nwthc-prometheus-operator-guide/) |
| 2026-08-15 | What is Harness                                                 | [View](https://rouroumaibing.github.io/2026/08/15/ai/20260815-qxcvb-harness-core-concepts/)       |
| 2026-08-14 | Agent Concepts Overview                                         | [View](https://rouroumaibing.github.io/2026/08/14/ai/20260814-hkmda-agent-core-concepts/)         |
| 2026-08-07 | What Happens in Kubernetes After Creating an Ingress?          | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-atijk-create-ingress-after/) |
| 2026-08-07 | What Happens After Creating a PVC?                             | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-bulmn-create-pvc-after/) |
| 2026-08-07 | Pod                                                            | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-lidav-pod/)              |
| 2026-08-07 | What Happens After Creating a Pod?                            | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-loiuj-create-pod-after/) |
| 2026-08-07 | What Happens After Creating a StatefulSet?                    | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-wkqzm-create-statefulset-after/) |
| 2026-08-07 | What Happens After Creating a Deployment?                     | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-xkqzf-create-deployment-after/) |
| 2026-08-07 | DaemonSet Architecture Analysis                               | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-xptba-create-daemonset-after/) |
| 2026-08-07 | Job and CronJob Architecture Analysis                         | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-yrcde-create-job-cronjob-after/) |
| 2026-08-07 | What Happens After Creating a Service?                        | [View](https://rouroumaibing.github.io/2026/08/07/cncf/kubernetes/20260807-zsfgh-create-service-after/) |
| 2026-08-06 | Building a Personal Blog with Hexo + GitHub Actions           | [View](https://rouroumaibing.github.io/2026/08/06/github/20260806-hvggd-setup-blog-with-hexo-and-github-actions/) |

## Writing Rules

Read these before adding a post.

- [source/RULES.md](source/RULES.md) — naming conventions, front matter, categories and tags
- [source/templates/CONCEPT-BASED-KNOWLEDGE.md](source/templates/CONCEPT-BASED-KNOWLEDGE.md) — template for concept posts
- [source/templates/SOFT-KNOWLEDGE.md](source/templates/SOFT-KNOWLEDGE.md) — template for software and tool posts
- [source/templates/TECHNICAL-DOCUMENT-REQUIREMENTS.md](source/templates/TECHNICAL-DOCUMENT-REQUIREMENTS.md) — template for solution and technical docs

## Local Development

```bash
pnpm install      # install dependencies
pnpm server       # local preview at http://localhost:4000
pnpm build        # generate static files
```

> Image optimization is handled by `hexo-image-opt` at build time (`pnpm build`); the local preview (`pnpm server`) had its infinite regeneration loop (triggered by the image-optimization output) fixed.
