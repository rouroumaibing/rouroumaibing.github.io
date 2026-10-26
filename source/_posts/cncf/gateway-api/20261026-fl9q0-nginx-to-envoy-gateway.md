---
title: 从 NGINX Ingress 到 Envoy Gateway：一次 Kubernetes 入口架构迁移实践梳理
date: 2026-10-26 10:26:00
tags:
  - gateway-api
  - kubernetes
  - envoy
  - envoy-gateway
  - ingress
  - ingress-nginx
  - 架构
  - 迁移
categories:
  - gateway-api
---

> 原文：公众号「云原生SRE」《从 NGINX Ingress 到 Envoy Gateway：一次 Kubernetes 入口架构迁移记录》（2026-09-29）。本文在忠实还原原文技术内容的基础上，重新组织了叙述顺序，并补充了「为什么这样设计」的分析视角。

---

## 一、为什么要迁移：不是 NGINX 不好，是时代变了

NGINX Ingress 本身并没有原罪。它成熟、稳定、资料丰富，在平台建设初期用极低成本解决了集群入口、域名路由和 TLS 三件大事。推动这次迁移的直接原因有两个：

1. **项目已正式退休（EOL）。** Ingress NGINX 不再获得安全更新。生产环境长期运行一个不再打补丁的入口组件，风险不可接受。
2. **模型天花板。** 传统 Ingress API 围绕「域名 + 路径 + Service」设计，而平台层要统一管理的东西越来越多：认证、重试、超时、Header、CORS、流量策略——这些诉求被一股脑塞进 Ingress 的 annotations 和 Controller 的 ConfigMap 里，基础设施职责和业务路由职责越来越难区分。

一个典型的 NGINX Ingress 配置长这样：

```yaml
nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
nginx.ingress.kubernetes.io/rewrite-target: /
nginx.ingress.kubernetes.io/auth-url: https://auth.example.com/check
nginx.ingress.kubernetes.io/enable-cors: "true"
```

这些 annotations 好用，但有两个致命问题：

- **非标准**：它们属于 NGINX 私有扩展，不是 Kubernetes 标准资源。一旦更换 Controller，这些配置基本要重写。
- **职责混杂**：业务路由和安全策略耦合在同一个对象里，团队边界被模糊掉。

> 分析视角：这次迁移的本质不是「把 NGINX 进程换成 Envoy」，而是借 Kubernetes **Gateway API** 重新划分「入口网关 / 应用路由 / 流量策略」三条边界。这是一次架构层面的职责再分配，而不是一次简单的组件替换。

---

## 二、先理清概念：Envoy ≠ Envoy Gateway

很多人把这两个名字混用，但它们在架构里扮演完全不同的角色：

| 组件 | 角色 | 职责 |
| --- | --- | --- |
| **Envoy Proxy** | 数据面（Data Plane） | 真正接收、匹配、转发请求；负载均衡、超时重试、Header 处理、指标与访问日志 |
| **Envoy Gateway** | 控制面（Control Plane） | 监听 Gateway API 资源（GatewayClass / Gateway / HTTPRoute / Policy），把它们翻译成 Envoy 配置 |

一句话总结：

> **Envoy Gateway 负责生成与管理配置，Envoy Proxy 负责执行配置与转发流量。**

控制链路是：`Gateway API Resources → Envoy Gateway Controller → Envoy Configuration → Envoy Proxy`。

---

## 三、Gateway API 怎么描述入口：把一件事拆成多件事

传统 Ingress 把所有职责压在一个对象上；Gateway API 把它拆成职责清晰的多类资源：

- **GatewayClass**：声明由哪个 Controller 来管理 Gateway（类似 IngressClass，但更标准）。
- **Gateway**：定义入口的监听端口、协议、TLS。通常由**平台团队**维护。
- **HTTPRoute**：应用声明「域名 + 路径 → 后端 Service」的路由规则。通常由**应用团队**维护。

关键收益是**团队职责分离**：平台团队管 Gateway（入口、TLS、基础设施），应用团队只管自己的 HTTPRoute（业务路由），彼此互不踩脚。

```yaml
# Gateway：平台团队维护
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: envoy-gateway
  namespace: ingress
spec:
  gatewayClassName: envoy-gateway
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-example-com
---
# HTTPRoute：应用团队维护
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: projects-api
  namespace: application
spec:
  parentRefs:
    - name: envoy-gateway
      namespace: ingress
  hostnames:
    - portal.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api/projects
      backendRefs:
        - name: projects-api
          port: 8080
```

---

## 四、迁移架构：Terraform、Argo CD、Helm 各管一段

这次迁移最值得借鉴的，是它没有「人肉 kubectl 改线上」，而是把切换逻辑固化成了声明式流水线的几个开关。

```
Terraform 设置入口类型（nginx / envoy）
        │
        ▼
Argo CD 集群 label 变为 ingress.example.io/type=envoy
        │
        ▼
ApplicationSet 匹配该 label → 部署 Envoy Gateway
        │
        ▼
Helm 根据入口类型生成 Gateway / HTTPRoute / Ingress
        │
        ▼
Envoy Gateway Controller 下发配置 → Envoy Proxy 执行路由
```

**1. Terraform 切换底层数据面。** 保留 NGINX 和 Envoy 两套 selector 配置，用一个变量决定用哪套：

```hcl
locals {
  ingress = "envoy"   # 改成 "nginx" 即可切回
  ingress_types = {
    nginx = { selector = { "app.kubernetes.io/name" = "ingress-nginx" }, ports = { http = 80, https = 443 } }
    envoy = { selector = { "app.kubernetes.io/component" = "proxy", ... }, ports = { http = 10080, https = 10443 } }
  }
  ingress_config = local.ingress_types[local.ingress]
}
```

入口 Service 的 `selector` 和 `targetPort` 随变量变化，但 **Service 名称、云负载均衡后端都不变**——真正切换的只是 Service 背后的数据面。回滚只需把 `ingress = "envoy"` 改回 `"nginx"`。

**2. Argo CD 按集群 label 部署。** Terraform 注册集群时写入 `ingress.example.io/type=envoy`，ApplicationSet 用这个 label 筛选集群并部署 Envoy Gateway，实现「不同集群按开关进入新架构」。

**3. Helm 兼容新旧入口。** 迁移期 Helm Chart 同时支持 Ingress 和 HTTPRoute，靠一个 `enableIngressHostnamesFallback` 开关解决新旧字段不一致的问题：

```yaml
global:
  httpRouteIngress:
    enabled: true
    enableIngressHostnamesFallback: true   # 没配 hostname 时复用旧 Ingress hosts
  ingress:
    enabled: false
    hosts:
      - portal.example.com
```

> 分析视角：这个 fallback 开关非常关键。共享 Gateway 下，如果大量 HTTPRoute 都没有 `hostnames`，它们会匹配**所有域名**，造成路由范围重叠、请求进错后端的严重问题。一个兼容开关，既平滑了配置迁移，又兜住了安全底线。

---

## 五、迁移顺序：五阶段，每步都可回滚

迁移没有一次性删 NGINX，而是分阶段推进，每一步都能退回旧入口：

1. **部署 Envoy**：先把 Gateway API CRDs、Envoy Gateway Controller、GatewayClass、Gateway、Envoy Proxy 全部就绪，生产流量仍走 NGINX。
2. **创建 HTTPRoute**：应用同时保留 Ingress 和 HTTPRoute，通过 Envoy 内部地址测试路由是否正常。
3. **切换入口 Service**：确认无误后，把 Terraform 开关从 `nginx` 改为 `envoy`，外部流量改走 Envoy。
4. **观察验证**：重点盯云 LB backend 健康、Envoy Pod readiness、HTTPRoute 状态、4xx/5xx 比例、自定义域名、TLS、WebSocket/长连接、access log。
5. **清理 NGINX**：稳定运行一段时间后再删除旧 Controller、Service、IngressClass、业务 Ingress 和 annotations。

---

## 六、几个必须注意的坑

1. **顺序不能反**：绝不能先切 Service selector 再部署 Envoy。否则 Service 没有 endpoints，外部请求直接 502。正确顺序是「先部署 Envoy → 建 HTTPRoute → 测试 → 最后切 Service」。

2. **健康检查别依赖业务 hostname**：云 LB 如果用 `GET / Host: localhost` 探活，Envoy 可能因没有对应 HTTPRoute 返回 404。应使用 Envoy 专用 readiness 地址，如 `/ready:19003`。

3. **HTTPRoute 必须显式配 hostname**：否则在共享 Gateway 下匹配所有域名，与其他 Route 重叠。

---

## 七、能力对比：迁移前后到底换了什么

| 能力 | NGINX Ingress | Envoy Gateway |
| --- | --- | --- |
| 路由资源 | Ingress | HTTPRoute |
| 入口定义 | IngressClass | GatewayClass + Gateway |
| 数据面 | NGINX | Envoy Proxy |
| 控制面 | NGINX Ingress Controller | Envoy Gateway Controller |
| 高级配置 | annotations / ConfigMap | Gateway API + Policy |
| 超时/重试 | NGINX annotations | BackendTrafficPolicy |
| CORS/认证 | annotations / 外部组件 | SecurityPolicy |
| Header 策略 | annotations | ClientTrafficPolicy |
| 跨 namespace 路由 | 能力有限 | Gateway API 原生支持 |
| 团队职责分离 | 较弱 | Gateway 与 Route 可分治 |
| 实现依赖 | 与 NGINX 强绑定 | 接近 K8s 标准模型 |

---

## 八、总结：短期更重，长期更清晰

这次迁移最初看着只是「换个 Ingress Controller」，实际涉及的范围比预期广得多——NGINX Ingress 一个人扛了数据面、路由和部分策略三份活，迁到 Envoy Gateway 后这些职责被重新拆分到 Terraform、Argo CD、Gateway、HTTPRoute、Policy 和 Envoy 各个角色上。

**短期看**，组件数量变多了，理解成本更高。**长期看**，Gateway API 把「入口基础设施、应用路由、流量策略」切得更干净：应用不再依赖某个 Controller 的私有 annotations，平台团队也能在不碰业务 Route 的前提下统一维护入口与安全策略。

> 一句话收尾：迁移的重点从来不是「用 Envoy 替换 NGINX」，而是借 Gateway API，把原本绑死在单一 Ingress Controller 上的路由和策略，逐步迁到一套更标准、更清晰的 Kubernetes 网络模型中。

---

### 附：本文要点速记

- 迁移动因 = 项目 EOL + Ingress 模型天花板（非标准 annotations、职责混杂）。
- Envoy Gateway 是控制面，Envoy Proxy 是数据面；前者生成配置，后者转发流量。
- Gateway API 三件套：GatewayClass（谁管）/ Gateway（入口与 TLS）/ HTTPRoute（业务路由），天然支持团队职责分离。
- 用 Terraform 变量 + 集群 label + Helm 开关把「切换」固化成声明式流水线，Service 名与 LB 后端不变，回滚只需改一个值。
- 五阶段、可回滚；坑点集中在切换顺序、健康检查地址、HTTPRoute hostname 显式声明。
