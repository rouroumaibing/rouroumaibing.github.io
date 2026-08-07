---
title: 当创建一个 StatefulSet 后，Kubernetes 会发生什么？
date: 2026-08-07 16:20:41
tags:
  - k8s
  - StatefulSet
  - 源码分析
categories:
  - CNCF
  - k8s
  - workload
---

## 一、StatefulSet 介绍

* StatefulSet 是用来管理有状态应用的工作负载对象，StatefulSet 管理基于相同容器规约的一组 Pod，使用持久标识符为工作负载 Pod 提供持久存储。和 Deployment 类似，也属于副本控制器，但和 Deployment 不同的是， StatefulSet 为它们的每个 Pod 维护了一个有粘性的 ID。无论该类 Pod 的生命周期如何变化，每个 Pod 的标识符 ID 不会变化。另外还支持服务实例有序部署和扩展，并提供有状态应用程序所需的有序启动和终止策略
* StatefulSet 工作负载之间使用 Headless Service 来定义 Pod 网路标识，生成可解析的 DNS 域名名称记录，用于同一 StatefulSet 工作负载彼此 Pod 之间的通信。

## 二、StatefulSet 工作负载访问方式

与其他的工作负载（如 Deployment）的对外访问方式相似，但有所区别。Deployent 工作负载使用 service（带有 IP 地址的服务）提供对外服务访问，但在一些特殊场景中，客户端访问不需要 Kubernetes 中 service 实现的负载均衡功能，而是由客户端直接去发现/选择服务端的后端实例访问，就需要一种特殊的服务"Headless service"。这是一种没有访问入口（即 service 没有 IP 地址）的 service。kube-proxy 不会为这种类型的 service（Headless service）创建 iptables/ipvs 转发规则。

```bash
apiVersion: v1
kind: Service
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  ports:
  - port: 80
    name: web
  clusterIP: None
  selector:
    app: nginx
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
spec:
  selector:
    matchLabels:
      app: nginx # 必须匹配 .spec.template.metadata.labels
  serviceName: "nginx"
  replicas: 3 # 默认值是 1
  minReadySeconds: 10 # 默认值是 0
  template:
    metadata:
      labels:
        app: nginx # 必须匹配 .spec.selector.matchLabels
    spec:
      terminationGracePeriodSeconds: 10
      containers:
      - name: nginx
        image: registry.k8s.io/nginx-slim:0.8
        ports:
        - containerPort: 80
          name: web
        volumeMounts:
        - name: www
          mountPath: /usr/share/nginx/html
  volumeClaimTemplates:
  - metadata:
      name: www
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: "my-storage-class"
      resources:
        requests:
          storage: 1Gi
```

其中 StatefulSet 关联的 Pod 与 PVC、PV 的关系如下图：

![StatefulSet 关联的 Pod 与 PVC、PV 关系](/images/20260807/wkqzm/statefulset-pod-pvc-pv-relationship.png)

## 三、StatefulSet 工作负载创建流程

![StatefulSet 创建流程](/images/20260807/wkqzm/statefulset-creation-flow.png)

1. 用户通过 kubectl 客户端发起创建 StatefulSet 资源对象请求至 kube-apiserver。
2. kube-apiserver 对请求用户鉴权、准入控制操作，然后将该请求事件写入到 etcd 存储中。
3. 考虑到 StatefulSet-controller 采用非阻塞式长连接 watch 机制实时获取 StatefulSet 资源对象信息，一旦集群中有 StatefulSet 变化（包括创建、更新、删除），则通过 kube-apiserver 获取 etcd 中相关 StatefulSet 资源对象。
4. kube-apiserver 将 StatefulSet 资源返回给 StatefulSet-controller 的 watch 接口长连接。
5. StatefulSet-controller 维护 StatefulSet 的生命周期状态，并通过 StatefulSet 的模板确定副本数量，根据副本数量依序（0、1....N-1）创建 Pod 副本。
6. kube-apiserver 接收到 StatefulSet-controller 创建结果后，更新 etcd 存储中的 StatefulSet 状态信息和 Pod 创建事件。

## 四、StatefulSet-Controller 工作原理

![StatefulSet Controller 工作原理](/images/20260807/wkqzm/statefulset-controller-workflow.png)

在 StatefulSet 中，Informer 和 Event Handler 是两个重要的组件

* **informer：** 是一个 Kubernetes API 客户端，用于监视 Kubernetes API 中的资源对象的变化并更新到本地缓存中。当资源对象的状态发生变化时，Informer 会触发 Event Handler。
* **Event Handler：** 是一个回调函数，用于处理 Informer 发出的事件，Event Handler 会根据事件的类型，执行相应的操作。
* **Manage Revision：** 用于标识 StatefulSet 的每个更新版本，通过 Manage Revision，可以查看 StatefulSet 的更新历史，以便在需要时回滚到先前的版本。
* **Manger pods in order：** 管理 StatefulSet 中 Pod 的启动顺序，
* **Update in order：** 有序的更新 Pod。查看 Pod 期望的状态是否符合要求，不满足则删除重建，
* **Update Status：** 管理 StatefulSet 对象的更新状态。
* **replicas 数组** ：存放可用 Pod 的 ord 值（Pod 名称中 ID 标识符），（0 <= ord < Spec.replicas）
* **condemned 数组** ：存放需要删除 Pod 的 ord 值（Pod 名称中 ID 标识符），（ord >= Spec.replicas）
* 创建 StatefulSet 工作负载 Pod 实例

判断 StatefulSet 的管理策略：

* 若实例管理策略为 **并行策略** ，则遍历 replicas 数组，所有 Pod 同步创建，不区分启动先后顺序。
* 若实例管理策略为 **有序策略** ，遍历 replicas 数组，依序（0、1....N-1）创建 Pod。需确保 replicas 数组中的前一个 Pod 处于 runing 或 ready 状态。方可创建下一个 Pod。
* 最后检查 Pod 的信息是否与 StatefulSet 匹配，若不匹配则更新 Pod 的状态。如当前 StatefulSet 已关联 Pod，但是 Pod 标签不匹配则释放 Pod，重新新建 Pod 副本关联。

### 4.1 更新 StatefulSet 工作负载 Pod 实例

1. 判断 StatefulSet 的更新策略：
2. 如果更新策略为 **OnDelete** ，则不会自动触发更新行为，需要手动删除 Pod，系统对其进行重建更新。
3. 如果更新策略为 **RollingUpdate** ，则不再关注实例管理策略。都是按顺序进行处理且等待当前 Pod 删除成功后才继续小于上一个 Pod 顺序号的 Pod。
4. 最后检查 Pod 的信息是否与 StatefulSet 匹配，若不匹配则更新 Pod 的状态。如当前 StatefulSet 已关联 Pod，但是 Pod 标签不匹配则释放 Pod，重新新建 Pod 副本关联。

### 4.2 扩缩容 StatefulSet 工作负载 Pod 实例

 **扩容操作** ：

1. 更新 StatefulSet 的状态信息，将新建 Pod 的信息写入到 replicas 队列和 condemned 队列中。
2. 遍历 replicas 数组，确保 replicas 数组中的 Pod 处于 runing 或 ready 状态。发现 faild 状态的 Pod 删除重建，对未创建的 Pod 则直接创建。
3. 最后检查 Pod 的信息是否与 StatefulSet 匹配，若不匹配则更新 Pod 的状态。如当前 StatefulSet 已关联 Pod，但是 Pod 标签不匹配则释放 Pod，重新新建 Pod 副本关联。

**缩容操作：**

1. 更新 StatefulSet 的状态信息。
2. 遍历 condemned 数组，确保 replicas 数组中的 Pod 处于 runing 或 ready 状态。发现 faild 状态的 Pod 删除重建，对未创建的 Pod 则直接创建。然后按 Pod 名称标识符由大至小逆序删除 condemned 数组中若干个 Pod
3. 最后检查 Pod 的信息是否与 StatefulSet 匹配，若不匹配则更新 Pod 的状态。如当前 StatefulSet 已关联 Pod，但是 Pod 标签不匹配则释放 Pod，重新新建 Pod 副本关联。

### 4.3 删除 StatefulSet 工作负载 Pod 实例

如下 **processCondemned** 函数主要介绍删除 StatefulSet 工作负载 Pod

```go
func (ssc *defaultStatefulSetControl) processCondemned(ctx context.Context, set *apps.StatefulSet, firstUnhealthyPod *v1.Pod, monotonic bool, condemned []*v1.Pod, i int) (bool, error) {
	logger := klog.FromContext(ctx)
	if isTerminating(condemned[i]) {
		if monotonic {
			logger.V(4).Info("StatefulSet is waiting for Pod to Terminate prior to scale down",
				"statefulSet", klog.KObj(set), "pod", klog.KObj(condemned[i]))
			return true, nil
		}
		return false, nil
	}
	if !isRunningAndReady(condemned[i]) && monotonic && condemned[i] != firstUnhealthyPod {
		logger.V(4).Info("StatefulSet is waiting for Pod to be Running and Ready prior to scale down",
			"statefulSet", klog.KObj(set), "pod", klog.KObj(firstUnhealthyPod))
		return true, nil
	}
	if !isRunningAndAvailable(condemned[i], set.Spec.MinReadySeconds) && monotonic && condemned[i] != firstUnhealthyPod {
		logger.V(4).Info("StatefulSet is waiting for Pod to be Available prior to scale down",
			"statefulSet", klog.KObj(set), "pod", klog.KObj(firstUnhealthyPod))
		return true, nil
	}

	logger.V(2).Info("Pod of StatefulSet is terminating for scale down",
		"statefulSet", klog.KObj(set), "pod", klog.KObj(condemned[i]))
	return true, ssc.podControl.DeleteStatefulPod(set, condemned[i])
}
```

1. 该函数首先判断需要删除的 Pod 是否正在终止中，如果是，则根据是否为 **Pod 管理策略** 进行不同的处理。如果是有序策略，则会阻塞等待终止的 Pod 完全消失。如果不是有序策略，则直接返回，不做任何操作。
2. 如果需要删除的 Pod 不是第一个不健康的 Pod，且当前 **Pod 管理策略** 是 **有序策略** ，则会阻塞等待其他不健康 Pod 变为 Running 和 Ready 状态或者变为 Available 状态。如果不是有序策略，则直接返回，不做任何操作。
3. 最后，如果需要删除的 Pod 不处于终止中，且满足删除条件，则会执行删除操作，并返回 true。否则，直接返回 false。


旧文档链接：[当创建一个 StatefulSet 后，Kubernetes 会发生什么？](https://bbs.huaweicloud.com/blogs/417156)
