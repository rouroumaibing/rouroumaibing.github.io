---
title: Prometheus Operator 入门与实践
date: 2026-08-18 08:56:00
tags:
  - prometheus
  - prometheus-operator
  - kubernetes
  - 监控
  - hpa
  - 告警
categories:
  - CNCF
  - Prometheus
  - 监控
---

## 一、背景与定位

在云原生场景里，Prometheus 几乎成了 Kubernetes 监控的事实标准。但当集群规模变大、被监控目标增多后，直接手写 `prometheus.yml` 会变得难以维护：

- 每次新增服务都要改配置并手动 `reload`；
- 告警规则、采集规则和应用代码耦合；
- 多租户、多命名空间下配置膨胀；
- 高可用、长期存储需要额外拼接组件。

**Prometheus Operator** 的作用就是把这些运维动作抽象成 Kubernetes 原生的 CRD，让 Prometheus 的部署、采集目标发现、规则管理都能像管理 Pod 一样声明式完成。

这篇文章会把 Operator 的工作逻辑、部署方式、日常查看入口和两个实操案例（自定义指标 + HPA、磁盘告警）串起来，方便以后速查和落地。

## 二、Prometheus Operator 的核心工作逻辑

Operator 本质上是一个控制器：监听自定义资源（CR）的变化，自动生成 Prometheus 所需的配置文件并触发 reload。可以把它拆成两条主线理解。

### 2.1 指标采集规则

```
用户声明 ServiceMonitor / PodMonitor / Probe
        │
        ▼
Prometheus Operator 监听变化 → 合并生成 scrape_configs
        │
        ▼
压缩写入 Secret（prometheus.yaml.gz）
        │
        ▼
prometheus-server Pod 内的 init-config-reloader 在启动时解压
        │
config-reloader 持续监听 Secret 变化 → 解压 → 写入 /etc/prometheus/config_out/prometheus.env.yaml
        │
        ▼
调用 Prometheus 的 reload 接口使其生效
```

`prometheus-server` 这个 StatefulSet 里一般包含：

- `prometheus` 主容器：负责拉取指标、存储、PromQL 查询、对外 API。
- `config-reloader` 容器：监听配置并热加载。
- `init-config-reloader` 初始化容器：负责首次解压配置。

### 2.2 告警规则

```
用户声明 PrometheusRule
        │
        ▼
Prometheus Operator 合并规则 → 写入 ConfigMap（prometheus-server-rulefiles-x）
        │
        ▼
config-reloader 监听 ConfigMap 变化 → 调用 reload
        │
        ▼
Prometheus 的 rule_files 引用这些文件，完成告警规则热更新
```

对应到 Prometheus 配置里就是类似这样一段：

```yaml
rule_files:
  - /etc/prometheus/rules/xxx/*.yaml
```

## 三、架构图与 CRD 清单

### 3.1 常见组件

| 组件 | 作用 |
|---|---|
| **prometheus-operator** | 监听 CRD，部署并管理 Prometheus Server |
| **node-exporter** | 采集节点级指标（CPU、内存、磁盘、网络等） |
| **grafana** | 可视化展示监控数据 |
| **alertmanager** | 接收告警，做分组、抑制、路由，再通知负责人 |
| **kube-state-metrics** | 把集群资源状态转换成 Prometheus 指标 |
| **adapter** | 把自定义指标聚合到 Kubernetes Metrics API |
| **thanosSidecar** | 高可用场景下和 Prometheus Server 同 Pod，实现指标持久化 |
| **thanosQuery** | 高可用场景下做跨实例去重查询 |

### 3.2 主要 CRD

| CRD | 说明 |
|---|---|
| `Prometheus` | 定义一个 Prometheus Server 部署 |
| `PrometheusAgent` | 以 Agent 模式运行的 Prometheus 部署 |
| `Alertmanager` | 定义 Alertmanager 部署 |
| `ThanosRuler` | 定义 Thanos Ruler 部署 |
| `ServiceMonitor` | 声明如何监控一组 Service |
| `PodMonitor` | 声明如何监控一组 Pod |
| `Probe` | 声明如何监控 Ingress 或静态目标 |
| `ScrapeConfig` | 直接声明抓取配置，常用于集群外目标 |
| `PrometheusRule` | 定义告警和记录规则 |
| `AlertmanagerConfig` | 声明 Alertmanager 路由/抑制/接收器子配置 |

## 四、部署

这里使用社区官方方案 [kube-prometheus](https://github.com/prometheus-operator/kube-prometheus)。

### 4.1 版本要求

当前文档基于 **v0.16.0**，要求 Kubernetes 版本 **≥ 1.32**。

### 4.2 安装

```bash
# 下载
 curl -fsSL -o v0.16.0.tar.gz https://github.com/prometheus-operator/kube-prometheus/archive/refs/tags/v0.16.0.tar.gz
 tar -zxf v0.16.0.tar.gz
 cd kube-prometheus-0.16.0

# 安装 CRD
kubectl apply --server-side -f manifests/setup

# 等待 CRD 建立
kubectl wait \
  --for condition=Established \
  --all CustomResourceDefinition \
  --namespace=monitoring

# 安装核心组件
kubectl apply -f manifests/
```

### 4.3 卸载

```bash
kubectl delete --ignore-not-found=true -f manifests/ -f manifests/setup
```

## 五、入门三部曲

把 Prometheus 接入到实际工作负载，通常走下面三步。

1.看指标。Job/exporter(内部代码实现采集哪些指标，然后整合成Prometheus采集数据的格式)->部署并提供http访问地址（http://xxx:xx/metric）
2.看配置。Prometheus配置ServiceMonitor、PodMonitor对接job/exporter采集地址，成功对接就可以在Prometheus界面targets菜单页面查看到对接状态
3.看查询。Prometheus界面Graph页面可以输入指标名称，点击查询

### 5.1 看指标

被监控组件需要在代码里暴露 `/metrics`，或者通过 exporter 采集。以 `node-exporter` 为例，部署后访问它的 metrics 接口就能看到原始指标：

```bash
kubectl get svc node-exporter -n monitoring
curl <node-exporter-svc>:9100/metrics
```

![node-exporter /metrics 输出示例](/images/20260818/prometheus-operator-guide/node-exporter-metrics-output.png)

### 5.2 看配置

通过 `ServiceMonitor` 或 `PodMonitor` 告诉 Prometheus 该去哪里拉取指标。这些 CR 会被 Operator 自动转换成 Prometheus 的 `scrape_configs`。

一个典型的 `scrape_configs` 段落长这样：

![Prometheus 配置中的 relabel_configs](/images/20260818/prometheus-operator-guide/prometheus-config-relabel.png)

在 `relabel_configs` 里可以做指标过滤和标签处理。配置生效后，到 **Status → Targets** 页面就能看到各个服务的采集状态：

![Prometheus Targets 页面](/images/20260818/prometheus-operator-guide/prometheus-targets-page.png)

### 5.3 看查询

打开 Prometheus 的 **Graph** 页面，用 PromQL 查询。例如查看节点剩余文件系统空间：

```promql
node_filesystem_avail_bytes
```

![Prometheus Graph 查询示例](/images/20260818/prometheus-operator-guide/prometheus-graph-query.png)

## 六、实操案例

### 6.1 自定义指标 + HPA

目标：让 Kubernetes 根据容器 CPU 使用率做水平自动伸缩（HPA），但这个指标需要先在 Metrics API 里注册。

#### 步骤一：在 adapter-config 里新增自定义指标

```bash
kubectl -n monitoring edit cm adapter-config
```

新增 rules 段落：

```yaml
rules:
  - seriesQuery: 'container_cpu_usage_seconds_total{namespace!="",pod!=""}'
    seriesFilters: []
    resources:
      overrides:
        namespace:
          resource: namespace
        pod:
          resource: pod
    name:
      matches: "^(.*)_seconds_total"
      as: "${1}_core_per_second"
    metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[1m])) by (<<.GroupBy>>)'
```

字段含义：

- `seriesQuery`：PromQL请求数据（用户需要查询的指标，可根据实际情况填写）。
- `metricsQuery`：对seriesQuery中PromQL请求的数据进行聚合操作。
- `resources`：是PromQL里的数据Label，与resource进行匹配。此处的resource是指集群内的api-resource，例如Pod、Namespace和Node。您可以通过kubectl api-resources -o wide命令查看。此处Key对应Prometheus数据中的LabelName，请确认Prometheus指标数据中有此LabelName。
- `name`：指根据正则匹配把Prometheus指标名转为比较可读的指标名，此处将container_cpu_usage_seconds_total转为container_cpu_usage_core_per_second。

#### 步骤二：验证指标已在 Metrics API 注册

```bash
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods/*/container_cpu_usage_core_per_second"
```

#### 步骤三：创建 HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: hpa-nginx
  namespace: default
spec:
  maxReplicas: 10
  metrics:
  - pods:
      metric:
        name: container_cpu_usage_core_per_second
      target:
        averageValue: "80"
        type: AverageValue
    type: Pods
  minReplicas: 1
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
```

### 6.2 邮件告警：磁盘空间不足

告警分两部分：定义规则（PrometheusRule）和配置通知路由（Alertmanager/AlertmanagerConfig）。

#### 定义 PrometheusRule

可以用 `fallocate` 压测磁盘来验证告警触发：

```bash
# 模拟磁盘紧张
fallocate -l 70G /mnt/paas/disk-pressure
df -h /mnt/paas
# Filesystem                Size  Used Avail Use% Mounted on
# /dev/mapper/vgpaas-share   98G   74G   20G  80% /mnt/paas
```

告警规则示例：

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: demo-promrules-with-diskusage
  namespace: monitoring
  labels:
    app.kubernetes.io/component: alert-router
    app.kubernetes.io/instance: main
    app.kubernetes.io/name: alertmanager
    app.kubernetes.io/part-of: kube-prometheus
    prometheus: k8s
    role: alert-rules
spec:
  groups:
    - name: node-disk-usage
      rules:
        - alert: NodeDiskUsageOver65
          expr: |
            (1 - node_filesystem_avail_bytes{job="node-exporter", mountpoint="/mnt/paas"}
              / node_filesystem_size_bytes{job="node-exporter", mountpoint="/mnt/paas"}) * 100 > 65
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Node disk usage over 65% (current: {{ $value | printf \"%.2f\" }}%)"
            description: |
              Node {{ $labels.instance }} disk partition {{ $labels.mountpoint }} usage over 65%
              Current usage: {{ $value | printf "%.2f" }}%
              Device: {{ $labels.device }}

        - alert: NodeDiskUsageOver85
          expr: |
            (1 - node_filesystem_avail_bytes{job="node-exporter", mountpoint="/mnt/paas"}
              / node_filesystem_size_bytes{job="node-exporter", mountpoint="/mnt/paas"}) * 100 > 85
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Node disk usage over 85% (current: {{ $value | printf \"%.2f\" }}%)"
            description: |
              Node {{ $labels.instance }} disk partition {{ $labels.mountpoint }} usage over 85%
              Current usage: {{ $value | printf "%.2f" }}%
              Device: {{ $labels.device }}
```

#### 配置通知路由


```yaml
apiVersion: monitoring.coreos.com/v1alpha1
kind: AlertmanagerConfig
metadata:
  name: email-receiver-config
  namespace: monitoring
spec:
  route:
    groupBy: ['alertname','cluster', 'job']
    groupWait: 30s
    groupInterval: 5m
    repeatInterval: 4h
    receiver: 'email-notifications'
    routes:
    - matchers:
      - name: severity
        value: critical
      receiver: 'critical-email-notifications'
    - matchers:
      - name: severity
        value: warning
      receiver: 'warning-email-notifications'
  receivers:
  - name: 'email-notifications'
    emailConfigs:
    - to: 'default-alerts@example.com'
      from: 'alertmanager@example.com'
      smarthost: 'smtp.example.com:587'
      authUsername: 'alertmanager'
      authPassword:
        name: alertmanager-email-secret
        key: password
      requireTLS: true
      sendResolved: true
  - name: 'critical-email-notifications'
    emailConfigs:
    - to: 'critical-alerts@example.com'
      from: 'alertmanager@example.com'
      smarthost: 'smtp.example.com:587'
      authUsername: 'alertmanager'
      authPassword:
        name: alertmanager-email-secret
        key: password
      requireTLS: true
      sendResolved: true
  - name: 'warning-email-notifications'
    emailConfigs:
    - to: 'warning-alerts@example.com'
      from: 'alertmanager@example.com'
      smarthost: 'smtp.example.com:587'
      authUsername: 'alertmanager'
      authPassword:
        name: alertmanager-email-secret
        key: password
      requireTLS: true
      sendResolved: true
---
    apiVersion: v1
    kind: Secret
    metadata:
      name: alertmanager-email-secret
      namespace: monitoring
    type: Opaque
    data:
      password: <base64_encoded_smtp_password>
```

实际生产环境中，`AlertmanagerConfig` 通常还需要补充：

- `route`：告警分组策略、抑制规则、默认接收器；
- `receivers`：邮件、钉钉/企业微信 webhook、Slack 等；
- `inhibitRules`：抑制低优先级告警；
- `smtp/smarts 等 Secrets`：邮件服务器认证。

完整的邮件告警配置建议直接参考 [kube-prometheus Alertmanager 文档](https://github.com/prometheus-operator/kube-prometheus/blob/main/docs/customizations/alertmanager-config.md) 或 [Prometheus Operator AlertmanagerConfig API](https://prometheus-operator.dev/docs/api-reference/api-monitoring-v1alpha1/#alertmanagerconfig)。

## 七、总结

Prometheus Operator 把 Prometheus 的部署、采集目标发现、规则管理都封装成了 Kubernetes CRD，大幅降低了维护成本：

- 用 `ServiceMonitor` / `PodMonitor` 声明式接入被监控服务；
- 用 `PrometheusRule` 管理告警和记录规则；
- 用 `Prometheus` / `Alertmanager` CR 管理 Prometheus Server 和告警中心；
- 通过 adapter 把自定义指标对接进 HPA，实现业务自定义伸缩。
