---
title: 当创建一个 Ingress 后，Kubernetes 会发生什么？
date: 2026-08-07 17:20:15
tags:
  - k8s
  - Ingress
  - 源码分析
categories:
  - CNCF
  - k8s
  - ingress
---

## 一、Ingress 概述

Ingress 是一组路由转发规则合集，将集群内部服务通过 7 层协议暴露给用户，是一种 k8s 默认的资源。Ingress 资源对象用于定义来自外网的 HTTP 和 HTTPS 规则，流量路由由 Ingress 资源上定义的规则控制。从而达到管理控制进入集群内部流量的目的。

## 二、Ingress 相关定义

**Ingress 资源**：Ingress 是一个 API 对象，一般通过 yaml 进行配置，其作用是定义请求如何转发到 Service 的规则，可以理解为配置模板。

**Ingress-controller 组件**：入口控制器（ingress-controller）管理 L4 层和 L7 层请求的南北向流量，也就是指从集群外部进入或离开集群的流量。是具体实现反向代理及负载均衡的程序，对 Ingress 定义的规则进行解析，根据配置的规则来实现请求转发。

## 三、Ingress Controller 百花齐放

目前 Ingress 暴露集群内服务的行内被公认为是最好的方式，由于其重要地位，世面上有非常多的 Ingress Controller，常见的有：

* **Kubernetes Ingress** **Nginx**
  Kubernetes Ingress 的官方推荐的 Ingress 控制器，它基于 Nginx Web 服务器，并补充了一组用于实现额外功能的 Lua 插件。由于 Nginx 的普及使用，在将应用迁移到 K8S 后，该 Ingress 控制器是最容易上手的控制器，而且学习成本相对较低，建议使用。不过当配置文件太多的时候，Reload 会很慢。
* **Nginx Ingress**
  Nginx Ingress 是 NGINX 开发的官方版本，它基于 NGINX Plus 商业版本，NGINX 控制器具有很高的稳定性，持续的向后兼容性，没有任何第三方模块，并且由于消除了 Lua 代码而保证了较高的速度（与官方控制器相比）。它支持 TCP/UDP 的流量转发，付费版有很广泛的附加功能，主要缺点就是缺失了鉴权方式、流量调度等其他功能。
* **Kong Ingress**
  Kong Ingress 建立在 NGINX 之上，并增加了扩展其功能的 Lua 模块。kong 之前是专注于 API 网关，现在已经成为了成熟的 Ingress 控制器，相较于官方控制器，在路由匹配规则、upstream 探针、鉴权上做了提升，并且支持大量的模块插件，便与配置。它提供了一些 API、服务的定义，可以抽象成 Kubernetes 的 CRD，通过 Kubernetes Ingress 配置便可完成同步状态至 Kong 集群。
* **Traefik Ingress**
  traefik Ingress 是一个功能很全面的 Ingress，官方称其为：Traefik is an Edge Router that makes publishing your services a fun and easy experience。它具有许多有用的功能：连续更新配置（不重新启动），支持多种负载平衡算法，Web UI，指标导出，支持各种协议，REST API，Canary 版本等。开箱即用的"Let'sEncrypt"支持是另一个不错的功能。而且在 2.0 版本已经支持了 TCP / SSL，金丝雀部署和流量镜像/阴影等功能，社区非常活跃。
* **HAProxy Ingress**
  HAProxy 作为王牌的负载均衡器，在众多控制器中最大的优势还在负载均衡上。它提供了"软"配置更新（无流量丢失），基于 DNS 的服务发现，通过 API 的动态配置。HAProxy 还支持完全自定义配置文件模板（通过替换 ConfigMap）以及在其中使用 Spring Boot 函数。
* **APISIX Ingress**
  ApiSix Ingress 是一个新兴的 Ingress Controller，它主要对标 Kong Ingress。它具有非常强大的路由能力、灵活的插件拓展能力，在性能上表现也非常优秀。同时，它的缺点也非常明显，尽管 APISIX 开源后有非常多的功能，但是缺少落地案例，没有相关的文档指引大家如何使用这些功能。

## 四、Ingress Nginx 原理解析

![Ingress Nginx 架构](/images/20260807/atijk/ingress-nginx-architecture.png)

nginx-ingress 模块在运行时主要包括三个主体：**NginxController、Store、SyncQueue。**

**Store** 主要负责从 Kubernetes APIServer 收集运行时信息，感知各类资源（如 Ingress、Service 等）的变化，并及时将更新事件消息（event）写入一个环形管道；

**NginxController** 作为中间的联系者，监听 updateChannel，一旦收到配置更新事件，就向同步队列 syncQueue 里写入一个更新请求。

**SyncQueue**：

1. 协程定期扫描 syncQueue 队列，发现有任务就执行更新操作
2. 借助 Store 完成最新运行数据的拉取（一般为新写入信息）

然后根据一定的规则产生新的 Nginx 配置，（有些更新必须 reload，就本地写入新配置，执行 reload），然后执行动态更新操作，即构造 POST 数据，向本地 Nginx Lua 服务模块发送 post 请求，实现配置更新；

Lua 是一种轻量小巧的脚本语言，用标准 C 语言编写并以源代码形式开放，其设计目的是为了嵌入应用程序中，从而为应用程序提供灵活的扩展和定制功能。Ingress Nginx Controller 嵌入多个 Lua 脚本。下面对整个 Lua 脚本处理过程做个简单梳理。

![Ingress Nginx Lua 处理流程](/images/20260807/atijk/ingress-nginx-lua-workflow.png)

* **init_by_lua*：** 初始化 Nginx 和预加载 Lua（Nginx 启动和 reload 时执行）；
* **init_worker_by_lua***：每个工作进程（worker_processes）被创建时执行，用于启动一些定时任务，
  比如心跳检查，后端服务的健康检查，定时拉取服务器配置等；
* **ssl_certificate_by_lua***：对 HTTPS 请求的处理，即将启动下游 SSL（HTTPS）连接的 SSL 握手时执行，用例：按照每个请求设置 SSL 证书链和相应的私钥，按照 SSL 协议有选择的拒绝请求等；
* **set_by_lua***：设置 Nginx 变量；
* **rewrite_by_lua***：重写请求（从原生 Nginx 的 rewrite 阶段进入），执行内部 URL 重写或者外部重定向，典型的如伪静态化的 URL 重写；
* **access_by_lua***：处理请求（和 rewrite_by_lua 可以实现相同的功能，从原生 Nginx 的 access 阶段进入）；
* **content_by_lua***：执行业务逻辑并产生响应，类似于 JSP 中的 servlet；
* **balancer_by_lua***：负载均衡；
* **header_filter_by_lua***：处理响应头；
* **body_filter_by_lua***：处理响应体；
* **log_by_lua***：记录访问日志

  ![Ingress Nginx Lua 阶段](/images/20260807/atijk/ingress-nginx-lua-phases.png)


旧文档链接：[当创建一个 Ingress 后，Kubernetes 会发生什么？](https://bbs.huaweicloud.com/blogs/417155)
