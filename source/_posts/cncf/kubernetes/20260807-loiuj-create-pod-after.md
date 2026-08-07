---
title: 当创建一个 Pod 后，Kubernetes 会发生什么？
date: 2026-08-07 14:59:03
tags:
  - k8s
  - Pod
  - 源码分析
categories:
  - CNCF
  - k8s
  - workload
---

## 一、Pod 简介

- Pod 是 Kubernetes 集群管理的最小调度单位，是一个逻辑概念，物理上不存在。
- 一个 Pod 中可以包含一个或多个容器，且同一个 Pod 中的所有容器共享网络、存储、进程等。

## 二、Pod 创建调度流程图

![Pod 创建调度流程图](/images/20260807/loiuj/pod-scheduling-flow.png)

**Pod 创建流程图说明：**

1. 用户通过 kubectl 客户端发起创建 Pod 资源对象请求至 kube-apiserver。
2. kube-apiserver 对请求用户鉴权、准入控制操作，然后将该请求资源事件写入到 etcd 存储中。
3. Scheduler 组件采用非阻塞式长连接 watch 机制实时获取集群待调度 Pod 资源对象信息（包括用户新建、各控制器为补足工作负载期望副本实例数而创建的 Pod）和当前集群 Node 节点状态信息，一旦获悉集群中有新 Pod 资源需要被调度，则通过 kube-apiserver 获取 etcd 中相关 Pod 资源对象信息。
4. kube-apiserver 将相关待调度的 Pod 资源信息返回给 Scheduler 的 watch 接口长连接。
5. Scheduler 根据自身算法，计算出 Pod 与最终生产 Pod 的 Node 节点的绑定关系，将该 Pod 绑定结果事件通过 kube-apiserver 存储在 etcd 中。
6. kube-apiserver 更新 etcd 中 Pod 的绑定信息。
7. 各 Node 节点上 Kubelet 组件采用非阻塞式长连接 watch 机制实时获取集群待调度 Pod 资源对象信息，一旦获悉集群中有新 Pod 资源调度到本节点，则通过 kube-apiserver 获取 etcd 中相关 Pod 资源对象。
8. kube-apiserver 将与本节点相关的调度 Pod 资源信息返回给 Kubelet 的 watch 接口长连接。
9. Kubelet 在本节点运行新 Pod 中的容器进程。然后将 Pod 最终运行状态上报给 kube-apiserver。
10. kube-apiserver 更新 etcd 中 Pod 的最终状态。

## 三、节点 Kubelet 生产 Pod 流程图

![Kubelet 生产 Pod 流程图](/images/20260807/loiuj/kubelet-pod-creation-flow.png)

Kubelet 核心工作原理：通过不同的事件来驱动循环控制（SyncLoop）运行，围绕不同子模块生产出不同的、有关 Pod 的消息传入通道，来供其他的子模块消费，完成不同的行为（创建、更新和删除等）。

**SyncLoop：** 是 Kubelet 的主要同步循环，它会定期检查 Pod 是否需要同步，并执行一些维护任务。函数会创建两个定时器，一个用于同步检查（syncTicker），另一个用于执行一些周期性的维护任务（housekeepingTicker）。在循环中，函数会检查是否有运行时错误，如果有则会进行指数退避，等待一段时间后再进行下一次循环。如果没有错误，则会重置退避时间，并调用 syncLoopIteration 函数进行同步操作。函数还会检查 resolv.conf 文件的限制，并记录同步循环的运行时间。

**syncLoopIteration**：是 Kubelet 同步 Pod 状态的核心循环。该方法会从多个 channel 中读取事件，根据事件类型调用不同的处理函数，最终更新 Pod 的状态。其中，configCh 是 Pod 配置的更新事件，plegCh 是 Pod 生命周期事件，syncCh 是需要同步的 Pod 集合，housekeepingCh 是清理过期 Pod 的事件。根据不同的事件类型，会调用不同的处理函数来更新 Pod 状态。需要注意的是，Kubelet 会将所有的 Pod 都视为新的 Pod，并进行 admission 过程，这可能会导致 Pod 被拒绝。此外，Kubelet 还会定期清理过期的 Pod。如果 Pod 的状态更新过程中出现错误，会记录日志并继续执行循环。

**canAdmitPod 和 canRunPod：** 用于判断一个 Pod 是否可以被接受和运行，通过遍历 Kubelet 中注册的运行 Pod 各类 Handler 函数，只要其中一个 Handler 返回 false，则输出 false、Reason 和 Message 日志。

## 四、容器运行时启动/运行容器流程图

![容器运行时启动运行容器流程图](/images/20260807/loiuj/container-runtime-startup-flow.png)

1. 当 Kubelet 完成创建容器前的准备工作后，就通过 RPC 调用 CRI 接口创建容器。
2. 容器运行时创建沙箱（sandbox），可以理解为 pause 容器。pause 容器是 Pod 中所有容器的根容器，在 Linux 系统上承担着父进程责任，为容器提供更多资源（IPC、Network、PID 等）。通过 namespace 的资源隔离，允许同一 Pod 内的容器之间可以共享和互访。
3. 创建 pause 容器时，会调用容器网络插件 CRI 接口，为容器分配 IP 地址资源。CNI 插件从本节点预定 IP 地址池中按序分配一个 IP 地址给容器。
4. 将分配后的相关信息保存到文件系统，确保主机上每个容器的 IP 地址的唯一性。
5. 一旦 Pause 容器完成初始化并处于 active 状态，则开始运行 init 容器。
6. 且如果有多个 init 容器，则严格按需启动。只有当前一个 init 容器正常退出了以后，才开始启动下一个 init 容器。
7. 拉取主业务容器运行需要的镜像，根据 PodSpec 中定义的镜像拉取。
8. 通过 CRI 创建主业务容器。Kubelet 使用 PodSpec 中定义的信息填充一个 ContainerConfig 数据结构（包括启动运行命令、业务镜像、标签资源、卷挂载、环境变量等），发送给 CRI。
9. Docker 反序列化数据结构，用于填充自身的配置信息。
10. 发送给 Docker 守护进程，在这个过程中，将一些元数据（容器类型、日志路径等）添加到容器中。
11. Kubelet 注册容器资源到 CPU 管理器，为容器分配 CPU 运行资源。
12. 使用容器启动命令运行主业务容器进程。
13. 待容器运行正常后执行容器预置 Lifecycle Hooks 函数。
