---
title: 当创建一个 Service 后，Kubernetes 会发生什么？
date: 2026-08-07 16:49:21
tags:
  - k8s
  - Service
  - 源码分析
categories:
  - CNCF
  - k8s
  - workload
---

## 一、Service 介绍

### 1.1 Kubernetes 为什么会引入 Service？

* 考虑到集群中 Pod 实例 IP 地址随着工作负载的生命周期的变化，常规通过访问 Pod 实例的 IP 方法变得不再实用。
* 每个工作负载通常有一个或者更多个后端 Pod 实例，如何将流量请求做到负载均衡转发也是迫在眉睫。

### 1.2 Service 概念

    Service 用于一组提供服务、具有相同 label Pod 的抽象集合的网络访问地址（包括网络协议 IPv4/IPv6 地址和服务域名地址），提供集群内/外访问通信，屏蔽后端实例 Pod 信息并为后端 Pod 实例提供负载均衡的能力。

### 1.3 Kubernetes 中存在哪些类型的 Service？

* ClusterIP：Kubernetes 集群默认自动设置 Service 的虚拟 IP 地址，仅可被集群内的其他客户端访问。
* NodePort：将 Service 的端口映射到每个 Node 的（指定/随机）端口，供集群外客户端通过集群任一节点的 IP 地址+（指定/随机）端口访问，即 NodePort。
* LoadBalancer：将 Service 映射到一个已存在的负载均衡器 IP 地址上，此 Service 方式多见于云厂商。
* ExternalName：通过在集群内创建该类 Service，可将集群外部服务引入至集群内，供集群内其他服务通过 IP 地址或域名地址访问。
* Headless Service：在一些特殊场景中，客户端访问不需要 Kubernetes 中 Service 实现的负载均衡功能，而是由客户端直接去发现/选择服务端的后端实例访问，就需要一种特殊的服务"Headless Service"。这是一种没有访问入口（即 Service 没有 IP 地址）的 Service。kube-proxy 不会为这种类型的 Service（Headless Service）创建 iptables/ipvs 转发规则。

## 二、Service、Endpoint、Pod 以及与 kube-proxy 组件的关联协作结构示意图

    下图是一个实际访问 Service 的图示，PodX 访问 Service（10.247.124.252:8080），在发送数据包时，在节点上根据 iptables 规则，目的 IP:Port 被随机替换为后端 Pod 组中某一个 Pod 的 IP:Port，从而通过 Service 转发到到实际的 Pod。从这里也可以看出，Service 对应的 IP（ClusterIP）不是一个真实的 IP 地址，是通过节点 kube-proxy 组件通过刷新节点 iptables 或者 ipvs 规则，将四层报文的目的 IP 从 ClusterIP DNAT 转换为 PodIP 做通的通道。集群外节点没有 kube-proxy 组件去刷新相关规则，是集群外节点无法访问 ClusterIP 的本质原因。

![Service、Endpoint、Pod 与 kube-proxy 协作结构](/images/20260807/zsfgh/service-endpoint-pod-kube-proxy.png)

## 三、Service 创建流程图以及解读

### 3.1 Service 创建后，各个组件协同关系介绍

![Service 创建后各组件协同关系](/images/20260807/zsfgh/service-creation-flow.png)

1. 用户通过 kubectl 客户端发起创建 Service 资源对象请求至 kube-apiserver。
2. kube-apiserver 对请求用户鉴权、准入控制操作，然后将该请求事件写入到 etcd 存储中。
3. 考虑到 Endpoint-controller 采用非阻塞式长连接 watch 机制实时获取 Service 资源对象信息，一旦集群中有 Service 变化（包括创建、更新、删除），则通过 kube-apiserver 获取 etcd 中相关 Service 资源对象。且通过 Service 资源对象中 label 字段遍历、关联相关 Pod 资源。
4. kube-apiserver 将相关 Service 资源信息和 Pod 资源信息返回给 Endpoint-controller 的 watch 接口长连接。
5. Endpoint-controller 通过获取的 Service 和 Pod 资源对象生成对应的 Endpoint 资源对象，并将结果通过调用 kube-apiserver 写入 etcd。
6. kube-apiserver 将 Endpoint 资源写入到 etcd 做持久化存储。
7. 考虑到 kube-proxy 采用非阻塞式长连接 watch 机制实时获取 Service 资源对象和 Endpoint 资源对象信息，一旦集群中有 Service 和 Endpoint 变化（包括创建、更新、删除），则通过 kube-apiserver 获取 etcd 中相关资源对象。
8. kube-apiserver 将相关 Service 资源信息和 Endpoint 资源信息返回给 kube-proxy 的 watch 接口长连接。
9. 每个节点上 kube-proxy 组件进程生成节点系统 iptables 规则或 ipvs 规则。

### 3.2 EndpointController 能力说明

    Endpoint 也是 Kubernetes 集群中的一个资源对象，存储在 etcd 中。Endpoint-controller 控制器通过监听集群内 Service 和 Pod 资源对象的变化，管理维护 Endpoint 的生命周期。

1. 监听到 Service 创建，则创建同名的 Endpoint 资源，然后根据 Service 的标签，获取集群中关联的 PodIP 和相关端口生成 Endpoint 资源对象。
2. 监听到 Service 更新，则根据更新后的 Service 信息获取关联的 Pod 的信息，更新对应 Endpoint 对象。
3. 监听到 Service 删除，则删除与 Service 同名的 Endpoint。
4. 如果监听到 Pod 发生变化，则更新 Endpoint 对象的 Pod IP 列表，将异常的 Pod 从 Endpoint 后端列表中剔除，恢复或者新建后加入到 Endpoint 的列表中。

### 3.3 各 Service 类型访问流量示意图

集群内访问（ClusterIP）

![ClusterIP 集群内访问](/images/20260807/zsfgh/service-clusterip-access.png)

节点访问（NodePort）

![NodePort 节点访问](/images/20260807/zsfgh/service-nodeport-access.png)

负载均衡（LoadBalancer）

![LoadBalancer 负载均衡](/images/20260807/zsfgh/service-loadbalancer-access.png)

Headless Service

图待补充

访问集群域名->coredns->具体podip


旧文档链接：[当创建一个 Service 后，Kubernetes 会发生什么？](https://bbs.huaweicloud.com/blogs/417159)
