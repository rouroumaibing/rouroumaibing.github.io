---
title: envoy-gateway
date: 2026-08-25 11:40:00
tags:
  - kubernetes
  - gateway-api
  - envoy
  - envoy-gateway
  - ingress
  - 架构
categories:
  - Kubernetes
  - Gateway-API
  - envoy-gateway
---


## 一、一句大白话描述概念

envoy-gateway（简称 EG）是「Gateway API 标准」的 **Envoy 原生实现**：它把 Kubernetes 里声明的 Gateway / HTTPRoute 等资源，翻译成 **xDS 配置**，再通过 xDS 协议动态下发给 **Envoy 代理**（数据面），由 Envoy 真正转发流量。

背景上，Kubernetes SIG Network 已宣布 **Ingress NGINX Controller 进入退役流程**，官方建议新项目直接迁移到 **Gateway API**；EG 就是其中用 Envoy 做数据面、社区最活跃的主流方案之一。和 NGF（NGINX 数据面）相比，EG 的数据面是标准 Envoy，配置语言统一为 xDS，扩展性和可观测性更好。

## 二、架构图

### 2.1 代码逻辑图（从入口到具体模块，带 file:line 标注）

EG 控制面不是「每个 CRD 一个 Reconciler」的经典 controller-runtime 写法，而是 **多个 Runner 通过内存消息通道串联的流水线**：Provider 抓取资源 → GatewayAPI Runner 翻译成中间表示（IR）→ 一路转成 xDS 下发给 Envoy，另一路生成 Envoy 基础设施。下方每个节点标注了真实 `文件:行号`（已对照源码）。

```text
① main()                                                    cmd/envoy-gateway/main.go:17
   └─▶ root.GetRootCommand(nil).ExecuteContext               cmd/envoy-gateway/root/root.go:20
        └─▶ server 命令 RunE → server()                      internal/cmd/server.go:49 / :85
             └─▶ loader.Start → startRunners                 internal/cmd/server.go:175
                  │
                  ├─▶ [Provider Runner] Start                 internal/provider/runner/runner.go:45
                  │     └─▶ kubernetes.New → 监听 Gateway API 资源
                  │           （GatewayClass/Gateway/HTTPRoute/...）
                  │           变化发布到 pResources 通道（ProviderResources）
                  │
                  ├─▶ [GatewayAPI Runner] subscribeAndTranslate   internal/gatewayapi/runner/runner.go:206
                  │     └─▶ t.Translate(resources)                internal/gatewayapi/runner/runner.go:328
                  │           └─▶ Translator.Translate             internal/gatewayapi/translator.go:267
                  │                 （Gateway API → IR：xdsIR + infraIR）
                  │           ├─▶ InfraIR.Store(key, val)         internal/gatewayapi/runner/runner.go:349
                  │           └─▶ XdsIR.Store(key, &m)            internal/gatewayapi/runner/runner.go:370
                  │
                  ├─▶ [Xds Runner] Start → 注册 gRPC xDS Server    internal/xds/runner/runner.go:151 / :220
                  │     └─▶ Translator.Translate(xdsIR → xDS 资源)  internal/xds/translator/translator.go:100
                  │           └─▶ SnapshotCache → gRPC(:18000, mTLS) 下发到 Envoy 代理
                  │
                  └─▶ [Infra Runner] Start → 订阅 infraIR          internal/infrastructure/runner/runner.go:47
                        └─▶ updateProxyInfraFromSubscription        internal/infrastructure/runner/runner.go:98
                              └─▶ 创建 Envoy Proxy 的 Deployment / Service（数据面）
```

要点：
- **翻译分两步**：先在 `gatewayapi` 包把 Gateway API 翻成与具体数据面无关的 **IR（中间表示）**，再由 `xds/translator` 把 IR 翻成 Envoy 能吃的 xDS。中间多一层 IR，是为了让 EG 能接多种 provider / 扩展。
- **三类消息通道**（`internal/message`）是流水线的纽带：`ProviderResources`（原始资源）、`XdsIR`（xDS 中间表示）、`InfraIR`（基础设施中间表示）；各 Runner 之间只通过这些通道解耦，互不直连。
- **数据面不是控制器自己 reload**，而是 Envoy 主动连控制面的 xDS gRPC（默认 `:18000`）拉取/接收配置——这是 xDS 标准做法，和 NGF 用 NGINX Agent 推配置异曲同工，但协议是 Envoy 原生的 xDS。

### 2.2 分层架构图（Layered Architecture Diagram，纯文本框）

自底向上三层，层间通过 gRPC（控制面↔Envoy 数据面）与 Kubernetes API（控制面↔集群）连接：

```text
┌─────────────────────────────────────────────────────────────┐
│ ① 应用意图层 / Gateway API CRDs（用户声明意图）                │
│   - GatewayClass (coffee-eg)                                 │
│   - Gateway (coffee-gateway / coffee-gateway-https)          │
│   - HTTPRoute / GRPCRoute (coffee)                           │
│   - EnvoyProxy (coffee-envoyproxy)  ← EG 特有：调数据面参数   │
└───────────────────────────────┬─────────────────────────────┘
                                 │ 依赖（上层意图由下层实现）
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ② 控制面层 / Control Plane（envoy-gateway Deployment）        │
│   - Provider Runner（抓取 Gateway API 资源）                 │
│   - GatewayAPI Translator（Gateway API → IR）                │
│   - xDS Server（IR → xDS，gRPC :18000）                      │
│   - Infra Manager（IR → Envoy 基础设施）                     │
└───────────────────────────────┬─────────────────────────────┘
                                 │ 依赖（配置经 xDS 下发；基础设施由 K8s 创建）
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ③ 数据面 / 基础设施层（真实转发）                             │
│   - Envoy 代理 Pod（每 Gateway 一组， Deployment+Service）    │
│   - TLS Secret (example-tls / a-example-com-cert ...)        │
│   - Kubernetes 集群 + LB / NodePort                          │
└─────────────────────────────────────────────────────────────┘
```

连接关系：控制面 ↔ 数据面走 **xDS gRPC（:18000，mTLS）**；控制面 ↔ 集群走 **Kubernetes API**（读取 Gateway API 资源、创建 Envoy 基础设施）；数据面 Envoy 收到 xDS 后自行加载配置、重载监听，无需共享卷或信号。

### 2.3 业务逻辑关联图（本文件夹 YAML 如何按字段互相绑定）

EG 的 YAML 比 NGF 多一个 **EnvoyProxy** CRD：它不挂在 Gateway 里，而是被 `GatewayClass.parametersRef` 引用，专门用来调数据面的参数（如 Envoy Service 类型、注解、HPA 等）。其余绑定关系与标准 Gateway API 一致。

```text
【HTTP 主链路：GatewayClass → Gateway → Route → Service → Pod】

GatewayClass: coffee-eg
  │  controllerName
  │  = gateway.envoyproxy.io/gatewayclass-controller
  │  parametersRef（EG 特有）
  ▼
EnvoyProxy: coffee-envoyproxy（调数据面参数，namespace: envoy-gateway-system）
  │
  ▼
Gateway: coffee-gateway（spec.gatewayClassName: coffee-eg）
  ▲  parentRefs（HTTPRoute 反向挂接）
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
| GatewayClass → 控制器 | `spec.controllerName` | 声明由哪个控制器实现（EG 固定为 `gateway.envoyproxy.io/gatewayclass-controller`） |
| GatewayClass → 数据面参数 | `spec.parametersRef`（group/kind/name/namespace） | 引用 EnvoyProxy CRD，调 Envoy 数据面行为 |
| Gateway → GatewayClass | `spec.gatewayClassName: coffee-eg` | Gateway 声明由哪个 GatewayClass 实现 |
| HTTPRoute → Gateway | `spec.parentRefs[].name` | 路由挂到哪个 Gateway 的 listener 上 |
| HTTPRoute → Service | `spec.rules[].backendRefs[].name/port` | 匹配到的请求转发到哪个后端 Service |
| Service → Deployment | `spec.selector` ↔ `template.metadata.labels` | Service 通过标签选中后端 Pod |
| Gateway(HTTPS) → Secret | `listeners[].tls.certificateRefs` | HTTPS listener 引用存证书的 Secret |
| 多域名 HTTPS | 多个 `listeners`，各自 `hostname` + `certificateRefs` | 同一端口 443 按 SNI 选择不同证书 |

## 三、实操步骤（实际在环境中查看各种内容）

> 命令来自 `tmp/envoy-gateway/envoy-gateway.txt` 与 `envoy-gateway.docx`，按执行顺序排列。版本以 `v1.6.1` 示例，实际按所用版本替换。

### A. 安装控制面与可选插件

```bash
# 1) 拉取 Helm Chart（控制面 + 可观测性插件包）
helm pull oci://docker.io/envoyproxy/gateway-helm --version v1.6.1
helm pull oci://docker.io/envoyproxy/gateway-addons-helm --version v1.6.1

# 2) 安装控制面（指定 controllerName，多套网关环境可自定义命名空间）
helm install eg gateway-helm-v1.6.1.tgz \
  -n envoy-gateway-system --create-namespace \
  --set config.envoyGateway.gateway.controllerName=gateway.envoyproxy.io/gatewayclass-controller

# 3)（可选）安装插件包：OpenTelemetry / Prometheus / Grafana / Loki / Fluent-bit 等
helm install eg-addons gateway-addons-helm-v1.6.1.tgz \
  -n monitoring --create-namespace \
  --set opentelemetry-collector.enabled=true \
  --set fluent-bit.enabled=false --set prometheus.enabled=false \
  --set grafana.enabled=false --set loki.enabled=false
```

> 端口用途：控制面 `:18000` gRPC（与 Envoy 通信）、`:19001` metrics、`9443` webhook；如需 admin console，安装时加 `--set config.envoyGateway.admin.address.host=0.0.0.0 --set config.envoyGateway.admin.address.port=19000`，再手动建一个 NodePort Service 暴露 `:19000`。

### B. 部署后端应用（coffee）

`http/coffee-deployment.yaml`（与 https 目录同名，内容一致；Deployment + Service）：

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

```bash
kubectl apply -f http/coffee-deployment.yaml
```

### C. HTTP 示例（GatewayClass + EnvoyProxy + Gateway + HTTPRoute）

四个清单依次 apply。注意 `GatewayClass` 用 `controllerName` 指向 EG，并通过 `parametersRef` 引用 `EnvoyProxy`（EG 特有的数据面调参 CRD）。

`http/coffee-gatewayclass.yaml`：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: coffee-eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
  parametersRef:
    group: gateway.envoyproxy.io
    kind: EnvoyProxy
    name: coffee-envoyproxy
    namespace: envoy-gateway-system
```

`http/coffee-envoyproxy.yaml`（EnvoyProxy：把数据面 Service 设为 LoadBalancer，并加 ELB 注解）：

```yaml
# https://gateway.envoyproxy.io/v0.4/user/customize-envoyproxy/#customize-envoyproxy-service-annotations
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: coffee-envoyproxy
  namespace: envoy-gateway-system
spec:
  provider:
    type: Kubernetes
    kubernetes:
      envoyService:
        type: LoadBalancer
        externalTrafficPolicy: Cluster
        annotations:
          kubernetes.io/elb.class: performance
          kubernetes.io/elb.id: f11c7d6e-856f-43fb-9141-9495d9db58bc
          kubernetes.io/elb.lb-algorithm: ROUND_ROBIN
          kubernetes.io/elb.health-check-flag: 'on'
          kubernetes.io/elb.health-check-option: '{"protocol":"TCP","delay":"5","timeout":"10","max_retries":"3"}'
```

`http/coffee-gateway.yaml`：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: coffee-gateway
  namespace: default
spec:
  gatewayClassName: coffee-eg
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
```

`http/coffee-httproute.yaml`：

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

```bash
kubectl apply -f http/coffee-gatewayclass.yaml
kubectl apply -f http/coffee-envoyproxy.yaml
kubectl apply -f http/coffee-gateway.yaml
kubectl apply -f http/coffee-httproute.yaml
```

### D. HTTPS / SNI 变体（https 示例）

先创建证书 Secret（脚本见 `https/cert.sh`），再部署 HTTPS / SNI 的 Gateway 与 HTTPRoute。

```bash
# 生成测试证书（生产环境请使用合法证书）
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/tls.key -out /tmp/tls.crt \
  -subj "/CN=*.example.com"

# 创建 Secret（HTTPS 用 example-tls；SNI 用 a/b-example-com-cert）
kubectl create secret tls example-tls    --key /tmp/tls.key --cert /tmp/tls.crt
kubectl create secret tls a-example-com-cert --key /tmp/tls.key --cert /tmp/tls.crt
kubectl create secret tls b-example-com-cert --key /tmp/tls.key --cert /tmp/tls.crt
```

`https/coffee-gateway-https.yaml`（单域名通配符证书）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: coffee-gateway-https
  namespace: default
spec:
  gatewayClassName: coffee-eg
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

`https/coffee-httproute.yaml`（HTTPRoute 挂到 coffee-gateway-https）：

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

`https/coffee-gateway-https-sni.yaml`（同一 443 按 SNI 选不同证书）：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: coffee-gateway-https-sni
  namespace: default
spec:
  gatewayClassName: coffee-eg
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

`https/coffee-httproute-sni.yaml`：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: coffee-https
  namespace: default
spec:
  parentRefs:
  - name: coffee-gateway-https-sni
  hostnames:
  - "*.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: coffee-svc
      port: 80
```

```bash
kubectl apply -f https/coffee-gateway-https.yaml
kubectl apply -f https/coffee-httproute.yaml
kubectl apply -f https/coffee-gateway-https-sni.yaml
kubectl apply -f https/coffee-httproute-sni.yaml
```

### E. 验证（查看资源与真实流量）

```bash
# HTTP：取 Gateway 对外地址，带 Host 头访问
export GATEWAY_HOST=$(kubectl get gateway/coffee-gateway -o jsonpath='{.status.addresses[0].value}')
echo $GATEWAY_HOST
curl -vH "host: coffee.example.com" http://$GATEWAY_HOST/

# HTTPS：导出证书本地校验
kubectl get secret example-tls -o jsonpath='{.data.tls\.crt}' | base64 -d > /tmp/server.crt
export GATEWAY_HOST=$(kubectl get gateway/coffee-gateway-https -o jsonpath='{.status.addresses[0].value}')
curl --cacert /tmp/server.crt https://coffee.example.com --resolve "coffee.example.com:443:$GATEWAY_HOST"
```

### F. 问题排查（egctl）

EG 自带 `egctl` 命令行工具，可看资源状态、直接查 Envoy 里的路由/监听器/端点配置：

```bash
# 安装 egctl（以 v1.6.1 linux 为例）
wget https://github.com/envoyproxy/gateway/releases/download/v1.6.1/egctl_v1.6.1_linux_amd64.tar.gz
tar -zxvf egctl_v1.6.1_linux_amd64.tar.gz
mv bin/linux/amd64/egctl /usr/local/bin/egctl

# 查看资源状态
egctl x status all -A
egctl x status gateway -v
egctl x status httproute -n default -v

# 直接看 Envoy 代理里的配置（排查路由未生效时有用）
egctl config envoy-proxy route <proxy-pod-name> -n envoy-gateway-system
egctl config envoy-proxy listener <proxy-pod-name> -n envoy-gateway-system
egctl config envoy-proxy endpoint <proxy-pod-name> -n envoy-gateway-system

# 收集诊断包
egctl experimental collect -o routing-issue-bundle.tar.gz
```

### G. 卸载

```bash
helm uninstall eg -n envoy-gateway-system
helm uninstall eg-addons -n monitoring
# 改配置后想让控制面重新加载：
kubectl rollout restart deployment envoy-gateway -n envoy-gateway-system
```

## 四、体验结论

- **定位与 NGF 同赛道、不同数据面**：EG 和 NGF 都是「Gateway API 标准」的实现，区别在**数据面是 Envoy 还是 NGINX**。EG 用 Envoy，配置统一走 xDS，生态（WASM、可观测性、扩展策略）更丰富；NGF 用 NGINX，配置是 NGINX 指令。
- **架构是 Runner + 消息通道流水线**：控制面由 Provider / GatewayAPI Translator / xDS Server / Infra Manager 四个 Runner 组成，靠 `ProviderResources / XdsIR / InfraIR` 三类通道解耦。翻译分两步——Gateway API → IR → xDS，中间那层 IR 让 EG 能接多种 provider 和扩展。这与 NGF「监听器投 eventCh → 重建整图」是两种不同的解耦思路。
- **EG 多了一个 EnvoyProxy CRD**：数据面参数（Service 类型、注解、HPA、TLS 等）不是写在 Gateway 里，而是由 `GatewayClass.parametersRef` 引用一个 `EnvoyProxy` 对象来调。这是 EG 相比 NGF 更灵活、也更绕的一点。
- **GatewayClass 用 controllerName 而非 gatewayClassName 字符串**：EG 的 `GatewayClass.spec.controllerName` 是完整字符串 `gateway.envoyproxy.io/gatewayclass-controller`，Gateway 再靠 `gatewayClassName` 指回它；NGF 则是 `gatewayClassName: nginx`。
- **配置下发靠 xDS 拉/推**：Envoy 主动连控制面 `:18000` 的 gRPC（mTLS）拿 xDS 配置，自行重载；控制面不直接 reload 数据面进程。可观测性上，EG 自带 `egctl` 能直接 dump Envoy 内部路由/监听器，排障比「进 Pod 看 conf」更顺手。
- **绑定同样靠字段不靠注解**：`gatewayClassName` / `parentRefs` / `backendRefs` / `selector` / `certificateRefs` 这套标准字段关系，和 NGF 完全一致；上手过 NGF 再学 EG 几乎零成本，重点只在 EnvoyProxy CRD 和 xDS 这两条新增概念。
- **迁移背景驱动**：Ingress NGINX 退役、官方推 Gateway API，是 EG/NGF 这类网关走红的直接原因；新集群建议直接上 Gateway API，别再写 Ingress 注解。
