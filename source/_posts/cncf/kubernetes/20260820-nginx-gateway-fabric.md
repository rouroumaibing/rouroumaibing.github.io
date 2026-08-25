---
title: nginx-gateway-fabric
date: 2026-08-20 09:15:00
tags:
  - kubernetes
  - gateway-api
  - nginx
  - nginx-gateway-fabric
  - ingress
  - 架构
categories:
  - Kubernetes
  - Gateway-API
  - nginx-gateway-fabric
---


## 一、一句大白话描述概念

nginx-gateway-fabric（简称 NGF）是 NGINX 官方做的一个 **Kubernetes 网关**，它把 Kubernetes 标准的 **Gateway API**（GatewayClass / Gateway / HTTPRoute 等 CRD）翻译成 NGINX 的配置，让你用一套声明式 YAML 就能把集群里的服务通过 NGINX 暴露出去、做七层路由、TLS 终止和虚拟主机分流——相当于「用官方网关语法来指挥 NGINX 干活」。

## 二、架构图

### 2.1 代码逻辑图（资源处理流水线，从入口到具体模块）

NGF 采用「控制面 / 数据面」分离的架构。控制面是 `controller-runtime` 写的 Go 控制器（Deployment `nginx-gateway-fabric`），监听 Gateway API 资源并生成 NGINX 配置，再经 NGINX Agent 通过 gRPC（mTLS）下发到数据面。下方流程从程序入口依次串联到数据面，并标注每步对应的源码文件与行号：

```text
① main()                                               cmd/gateway/main.go:20
   └─ 注册 cobra 子命令（含 controller 命令）
        │
② createControllerCommand()                            cmd/gateway/commands.go:86
   └─ 解析参数后调用 StartManager
        │
③ StartManager()                                        internal/controller/manager.go:125
   ├─ createManager() 建立 controller-runtime Manager    manager.go:519
   ├─ registerControllers() 注册所有 Watch               manager.go:793 → controller.Register(..., eventCh)  manager.go:1064
   ├─ NewEventLoop(eventCh, eventHandler)                manager.go:259
   └─ mgr.Start(ctx)                                     manager.go:288
        │
④【Watch 阶段】控制器把被监听对象的变更投入 eventCh
   - 监听类型：GatewayClass / Gateway / HTTPRoute / ReferenceGrant / Service / Secret / ConfigMap
   - 注册位置：registerControllers 的 controllerRegCfgs   manager.go:809-1070
   - 投递位置：controller.Register(..., eventCh, ...)      manager.go:1064
        │
⑤ eventLoop → HandleEventBatch()                        internal/controller/handler.go:193
   └─ gr := processor.Process(ctx)                       handler.go:210
        │
⑥【Graph 阶段】Process() 构建并校验关系图                internal/controller/state/change_processor.go:377
   └─ graph.BuildGraph(...)                              internal/controller/state/graph/graph.go:387
        │   （同时计算合法路由、TLS、校验结果 → 作为 Status 依据）
⑦【Status 阶段】写 Accepted / Programmed 等 Condition
   - 计算依据：graph.BuildGraph 的校验结果
   - 落库：statusUpdater.UpdateGroup(...)                handler.go:673 / 726 / 836 / 848
   - 实现：status.Updater.Update()                       internal/controller/status/updater.go:68
        │
⑧【Config 阶段】generator.Generate(conf) 生成 NGINX 文件   internal/controller/nginx/config/generator.go:124
   - 入参：dataplane.Configuration（servers / upstreams / locations / ssl / 策略）
   - 产出：[]agent.File
        │
⑨【推送阶段】nginxUpdater.UpdateConfig(deployment, files)  internal/controller/nginx/agent/agent.go:88
   └─ deployment.GetBroadcaster().Send(msg) 经 gRPC 下发到数据面 Agent
        │
⑩ 数据面：每 Gateway 1:1 对应一个 NGINX Deployment
   - provisioner 在 Gateway Upsert 时确保对应 Deployment 存在
   - 实现：provisioner/eventHandler.HandleEventBatch        internal/controller/provisioner/handler.go:30
   - 数据面 NGINX Agent 接收并应用配置、重载 nginx（无需共享卷/信号）
        │
⑪ nginx worker 进程处理真实客户端流量
```

### 2.2 分层架构图（Layered Architecture Diagram）

自底向上分为三层：基础设施/数据面层、控制面层、应用意图层（Gateway API CRD 层）。

```text
┌─────────────────────────────────────────────────────────────┐
│ ① 应用意图层 / Gateway API CRDs（用户声明意图）                │
│   - GatewayClass (nginx)                                     │
│   - Gateway (coffee-gateway)                                 │
│   - HTTPRoute / GRPCRoute (coffee)                           │
└───────────────────────────────┬─────────────────────────────┘
                                 │ 依赖（上层意图由下层实现）
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ② 控制面层 / Control Plane（翻译与编排）                       │
│   - nginx-gateway-fabric controller (Deployment)             │
│   - graph / status / config engine                          │
│   - NGINX Agent (gRPC mTLS)                                  │
└───────────────────────────────┬─────────────────────────────┘
                                 │ 依赖（控制面依赖数据面完成真实转发）
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ③ 基础设施 / 数据面层（真实转发）                              │
│   - NGINX 数据面 Pod（每 Gateway 1:1）                        │
│   - TLS Secret (example-tls)                                 │
│   - Kubernetes 集群 + LB / NodePort                          │
└─────────────────────────────────────────────────────────────┘

连接关系：层与层之间通过 gRPC（控制面↔数据面）与 Kubernetes API
（控制面↔集群）连接；自底向上依次为 数据面 → 控制面 → 意图层。
```

依赖关系：上层（意图）依赖下层（控制面）来实现，控制面依赖数据面来完成实际转发；层与层之间通过 gRPC（控制面↔数据面）与 Kubernetes API（控制面↔集群）连接。

### 2.3 业务逻辑关联图（本文件夹 YAML 如何按字段互相绑定）

本文件夹 `http/`、`https/` 下的多个 YAML 是通过**固定字段**串联起来的，核心关联链如下：

```text
【HTTP 主链路：Gateway → Route → Service → Pod】

GatewayClass: nginx（集群级，绑定 NGF 控制器）
  │  gatewayClassName
  ▼
Gateway: coffee-gateway（spec.gatewayClassName: nginx）
  ▲  parentRefs（HTTPRoute 反向挂接到此 Gateway）
  │
  ▼
HTTPRoute: coffee（spec.parentRefs[0].name: coffee-gateway）
  │  backendRefs
  ▼
Service: coffee-svc（spec.rules[0].backendRefs[0].name: coffee-svc）
  │  selector（matchLabels: app=coffee）
  ▼
Deployment: coffee（spec.selector.matchLabels: app=coffee）
  │
  ▼
Pod (nginx:perl) x2（label app=coffee）

【HTTPS 分支：Gateway(listener) → Secret】

Gateway: coffee-gateway-https
  │  listeners[].tls.certificateRefs
  ▼
Secret: example-tls（HTTPS 证书，需事先创建 tls.crt / tls.key）

【SNI 多域名分支：同一 443 端口按 hostname 选证书】

Gateway: coffee-gateway-https-sni
  ├─ listener a-https → hostname a.example.com → Secret: a-example-com-cert
  └─ listener b-https → hostname b.example.com → Secret: b-example-com-cert
  （按 hostname 选证书 = SNI；每个 listener 各自引用独立 Secret）
```

字段绑定速查表：

| 关联方向 | 关键字段 | 含义 |
|---|---|---|
| Gateway → GatewayClass | `spec.gatewayClassName: nginx` | Gateway 声明由哪个控制器（NGF）实现 |
| HTTPRoute → Gateway | `spec.parentRefs[].name` | 路由挂到哪个 Gateway 的 listener 上 |
| HTTPRoute → Service | `spec.rules[].backendRefs[].name/port` | 匹配到的请求转发到哪个后端 Service |
| Service → Deployment | `spec.selector` ↔ `template.metadata.labels` | Service 通过标签选中后端 Pod |
| Gateway(HTTPS) → Secret | `listeners[].tls.certificateRefs` | HTTPS listener 引用存证书的 Secret |
| 多域名 HTTPS | 多个 `listeners`，各自 `hostname` + `certificateRefs` | 同一端口 443 按 SNI 选择不同证书 |

## 三、实操步骤（实际在环境中查看各种内容）

> 以下命令来自 `tmp/nginx-gateway-fabric/nginx-gateway-fabric.txt` 与 `nginx-gateway-fabric-test.txt`，按实际执行顺序排列。

### A. 安装 CRD 与 Helm Chart

```bash
# 1) 安装 Gateway API 标准 CRD（GatewayClass / Gateway / HTTPRoute / GRPCRoute / ReferenceGrant 等）
kubectl kustomize https://github.com/nginx/nginx-gateway-fabric/config/crd/gateway-api/standard | kubectl apply -f -

# 2) 通过 OCI Helm Chart 安装控制面（自动建命名空间 nginx-gateway）
helm install ngf oci://ghcr.io/nginx/charts/nginx-gateway-fabric --create-namespace -n nginx-gateway

# 3) 部分受限/加固集群需要放开权限提升（按环境需要）
kubectl -n nginx-gateway patch deployment ngf-nginx-gateway-fabric \
  --type='json' \
  -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/securityContext/allowPrivilegeEscalation", "value": true}]'
```

备选：先下载 chart 再本地安装

```bash
helm pull oci://ghcr.io/nginx/charts/nginx-gateway-fabric --untar
cd nginx-gateway-fabric
helm install ngf . --create-namespace -n nginx-gateway
```

### B. 部署后端应用（HTTP 示例）

```bash
kubectl apply -f http/coffee-deployment.yaml   # Deployment(nginx:perl) + Service(coffee-svc)
kubectl apply -f http/coffee-gateway.yaml       # Gateway(coffee-gateway, HTTP:80, gatewayClassName:nginx)
kubectl apply -f http/coffee-httproute.yaml     # HTTPRoute(coffee) 绑定 Gateway 并路由到 coffee-svc
```

`http/coffee-deployment.yaml`（后端 Deployment + Service）：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coffee
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: coffee
  template:
    metadata:
      labels:
        app: coffee
    spec:
      containers:
      - name: coffee
        image: nginx:perl
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: coffee-svc
  namespace: default
spec:
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
  selector:
    app: coffee
```

`http/coffee-gateway.yaml`（Gateway，HTTP:80）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: coffee-gateway
  namespace: default
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
```

`http/coffee-httproute.yaml`（HTTPRoute，挂到 coffee-gateway 并路由到 coffee-svc）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: coffee
  namespace: default
spec:
  parentRefs:
  - name: coffee-gateway
  hostnames:
  - "coffee.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: coffee-svc
      port: 80
```

### C. HTTPS / SNI 变体（https 示例）

```bash
# 单域名通配符证书
kubectl apply -f https/coffee-gateway-https.yaml   # Gateway(HTTPS:443, hostname *.example.com, 引用 Secret example-tls)
kubectl apply -f https/coffee-httproute.yaml       # HTTPRoute 挂到 coffee-gateway-https

# 多域名 SNI（同一 443 端口按 hostname 选不同证书）
kubectl apply -f https/coffee-gateway-https-sni.yaml  # 两个 listener: a.example.com / b.example.com 各引用各自 Secret
```

`https/coffee-gateway-https.yaml`（Gateway，HTTPS:443 + 通配符证书）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: coffee-gateway-https
spec:
  gatewayClassName: nginx
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    hostname: "*.example.com"
    tls:
      certificateRefs:
      - kind: Secret
        group: ""
        name: example-tls
```

`https/coffee-httproute.yaml`（HTTPRoute，挂到 coffee-gateway-https）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: coffee-https
  namespace: default
spec:
  parentRefs:
  - name: coffee-gateway-https
  hostnames:
  - "coffee.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: coffee-svc
      port: 80
```

`https/coffee-gateway-https-sni.yaml`（Gateway，同一 443 按 SNI 选不同证书）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: coffee-gateway-https-sni
spec:
  gatewayClassName: nginx
  listeners:
  - name: a-https
    protocol: HTTPS
    port: 443
    hostname: a.example.com
    tls:
      certificateRefs:
      - kind: Secret
        group: ""
        name: a-example-com-cert
  - name: b-https
    protocol: HTTPS
    port: 443
    hostname: b.example.com
    tls:
      certificateRefs:
      - kind: Secret
        group: ""
        name: b-example-com-cert
```

> 注意：HTTPS 示例里的 `Secret`（如 `example-tls`、`a-example-com-cert`）需事先创建（tls.crt / tls.key），否则 Gateway listener 不会进入 Programmed 状态。

### D. 验证（查看资源与真实配置）

```bash
# 查看控制面与数据面是否就绪
kubectl get deploy
#   NAME                   READY   UP-TO-DATE   AVAILABLE   AGE
#   coffee                 2/2     2            2           107m
#   coffee-gateway-nginx   1/1     1            1           9m8s     <-- 数据面（每个 Gateway 1:1）

kubectl get svc
#   NAME                   TYPE           CLUSTER-IP      EXTERNAL-IP    PORT(S)        AGE
#   coffee                 ClusterIP      10.247.166.51   <none>         80/TCP         104m
#   coffee-gateway-nginx   LoadBalancer   10.247.24.35    192.168.2.71   80:31052/TCP   65s

# 进入数据面 Pod，确认 nginx 配置已被控制器刷新
kubectl exec -it coffee-gateway-nginx-6d6b648bb9-xk6rf -- cat /etc/nginx/conf.d/http.conf

# 通过 LoadBalancer 地址访问（带 Host 头匹配虚拟主机）
curl -H "host: coffee.example.com" http://192.168.2.71/
```

### E. 卸载

```bash
helm uninstall ngf -n nginx-gateway
```

## 四、体验结论

- **定位清晰**：NGF 是「Gateway API 标准」的 NGINX 实现，相比传统 Ingress，把角色拆分为 **GatewayClass（平台/运维）— Gateway（基础设施）— HTTPRoute（应用开发者）** 三层，职责边界更清楚，也更利于多团队共用集群。
- **控制面 / 数据面分离（2.x）**：每个 `Gateway` 对应一个独立数据面 Deployment（如 `coffee-gateway-nginx`），网关级隔离好；配置经 NGINX Agent 走 gRPC(mTLS) 下发并重载，不再依赖共享卷或信号，运维更干净。
- **绑定靠字段不靠注解**：Gateway 靠 `gatewayClassName` 找控制器，HTTPRoute 靠 `parentRefs` 挂 Gateway，靠 `backendRefs` 指 Service，靠 `selector` 连 Pod——整套关系一目了然，跨命名空间还能用 `allowedRoutes` / `ReferenceGrant` 精细授权。
- **HTTP 极简、HTTPS 是重点**：HTTP 只需 Gateway + HTTPRoute 两段；HTTPS 必须先把证书做成 `Secret`，再由 listener 的 `certificateRefs` 引用；多域名可用**多个 listener + 各自 hostname/证书**实现 SNI 分流，无需多个端口。
- **可观测性友好**：控制器会给资源写 `Accepted` / `Programmed` 状态，配合 `kubectl exec` 进数据面看 `/etc/nginx/conf.d/*.conf`，能快速确认「声明是否真的变成了 nginx 配置」。
- **安全注意**：示例里把 `allowPrivilegeEscalation` 改为 `true` 是为适配某些受限集群的临时手段，生产环境应优先走特权容器/Pod Security 标准的正规路径，不要长期放开。
- **上手建议**：先 `http/` 跑通端到端（部署→网关→路由→curl），再上 `https/` 练 TLS 与 SNI；CRD 用官方 `kustomize` 装标准版即可，避免功能缺失。
