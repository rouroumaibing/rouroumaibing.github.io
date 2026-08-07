---
title: DaemonSet 逻辑结构分析
date: 2026-08-07 16:30:12
tags:
  - k8s
  - DaemonSet
  - 源码分析
categories:
  - CNCF
  - k8s
  - workload
---

## 一、DaemonSet 简介

DaemonSet 是 Kubernetes 集群中一种特殊的工作负载控制器，用于确保集群中的每个节点（或符合特定条件的节点）都运行一个 Pod 副本。DaemonSet 主要用于部署系统级服务，如日志收集器、监控代理、网络插件等需要在每个节点上运行的组件。

### DaemonSet 的主要特点：

1. **节点全覆盖**：默认情况下，DaemonSet 会在集群中的每个节点上创建一个 Pod
2. **自动扩缩容**：当节点加入或离开集群时，DaemonSet 会自动调整 Pod 数量
3. **节点选择**：通过节点选择器（nodeSelector）、节点亲和性（nodeAffinity）和污点容忍（tolerations）控制 Pod 在哪些节点上运行
4. **更新策略**：支持滚动更新（RollingUpdate）和替换更新（OnDelete）两种策略

## 二、DaemonSet 核心工作原理

![DaemonSet 核心工作原理](/images/20260807/xptba/daemonset-core-workflow.png)

DaemonSet 控制器通过以下核心组件和流程实现其功能：

- **Informer**：用于监听 DaemonSet、Pod、Node 等资源的变化
- **Queue**：用于存储需要处理的 DaemonSet 资源键
- **Pods**：用于创建和删除 Pod
- **Nodes：** 用于需要部署的 node 清单管理
- **ControllerRevision**：用于管理 DaemonSet 的版本历史
- **DaemonSets**：DaemonSet 的主控制器，负责监听和同步 DaemonSet 资源

## 三、DaemonSet 创建流程图

### 创建流程

![DaemonSet 创建流程](/images/20260807/xptba/daemonset-creation-flow.png)

1. 用户通过 kubectl 客户端发起创建 DaemonSet 资源请求
2. kube-apiserver 对请求进行鉴权、准入控制，然后将请求写入 etcd
3. DaemonSet-controller 采用非阻塞式长连接 watch 机制实时获取 DaemonSet 资源对象信息，一旦集群中有 DaemonSet 变化（包括创建、更新、删除），则通过 kube-apiserver 获取 etcd 中相关 DaemonSet 资源对象
4. kube-apiserver 将 DaemonSet 资源信息返回给 DaemonSet-controller 的 watch 接口长连接
5. DaemonSet-controller 维护 DaemonSet 资源的生命周期，控制 pod 实例模板的数量、节点亲和性，将创建 pod 事件信息返回 kube-apiserver
6. kube-apiserver 接收到 DaemonSet-Controller 返回的创建 pod 事件信息后，然后将创建请求事件写入到 etcd 存储中。
7. Scheduler-Controller 采用非阻塞式长连接 watch 机制实时获取未调度 pod 资源对象信息，一旦集群中有 pod 没有目标节点，则通过 kube-apiserver 获取 etcd 中相关 pod 资源对象
8. kube-apiserver 将 pod 资源信息返回给 Scheduler-Controller 的 watch 接口长连接
9. Scheduler-Controller 根据打分，将节点和 pod 相互绑定，将新的 pod 信息返回 kube-apiserver
10. kube-apiserver 接收到 Scheduler-Controller 返回的创建 pod 事件信息后，然后将创建请求事件写入到 etcd 存储中
11. kubelet 通过 kube-apiserver 获取 etcd 中本节点相关 pod 资源对象
12. kube-apiserver 将 pod 资源信息返回给 kubelet，根据订阅本节点的 pod 信息，控制 pod 实例生命周期。

## 四、DaemonSet 调度机制

### 1. 节点选择逻辑

DaemonSet 控制器通过 `NodeShouldRunDaemonPod` 函数判断节点是否应该运行 DaemonSet 的 Pod：

- **节点选择器**：检查节点是否匹配 DaemonSet 的 nodeSelector
- **节点亲和性**：检查节点是否满足 DaemonSet 的 nodeAffinity 规则
- **污点容忍**：检查 DaemonSet 是否容忍节点的污点
- **资源约束**：检查节点是否有足够的资源运行 Pod

### 2. Pod 创建机制

当确定节点应该运行 DaemonSet 的 Pod 后，控制器会：

1. **创建 Pod 模板**：基于 DaemonSet 的模板创建 Pod 定义
2. **设置节点亲和性**：为 Pod 设置节点亲和性，确保 Pod 调度到目标节点
3. **批量创建**：使用批处理方式创建 Pod，避免一次性创建过多 Pod 导致 kube-apiserver 压力过大

### 3. 更新策略

DaemonSet 支持两种更新策略：

- **RollingUpdate**：默认策略，逐步更新 Pod，确保服务可用性
- **OnDelete**：只有当用户手动删除旧 Pod 时，才会创建新 Pod

## 五、DaemonSet 工作负载管理操作

### 4.1 更新 DaemonSet 工作负载 Pod 实例

判断 DaemonSet 的更新策略：

- 如果更新策略为 `OnDelete`，则不会自动触发更新行为，需要手动删除 Pod，系统对其进行重建更新。
- 如果更新策略为 `RollingUpdate`，则根据配置的 `maxSurge` 和 `maxUnavailable` 参数进行滚动更新：
  - 当 `maxSurge` 为 0 时，控制器会先删除旧 Pod，然后在这些节点上创建新 Pod
  - 当 `maxSurge` 大于 0 时，控制器会先在节点上创建新 Pod（最多 `maxSurge` 个），然后删除旧 Pod
  - 滚动更新过程中会确保不可用的 Pod 数量不超过 `maxUnavailable`

最后检查 Pod 的信息是否与 DaemonSet 匹配，若不匹配则更新 Pod 的状态。如当前 DaemonSet 已关联 Pod，但是 Pod 标签不匹配则释放 Pod，重新新建 Pod 副本关联。

### 4.2 扩缩容 DaemonSet 工作负载 Pod 实例

DaemonSet 的扩缩容操作与其他控制器有所不同，因为它是基于节点的：

#### 扩容操作：

当新节点加入集群时，DaemonSet 控制器会通过以下代码逻辑处理：

```go
func (dsc *DaemonSetsController) addNode(obj interface{}) {
    // 列出所有的 DaemonSet
    dsList, err := dsc.dsLister.List(labels.Everything())
    if err != nil {
        klog.V(4).Infof("Error enqueueing daemon sets: %v", err)
        return
    }
    node := obj.(*v1.Node)
    for _, ds := range dsList {
        // 判断节点是否应该运行该 DaemonSet 的 Pod
        if shouldRun, _ := NodeShouldRunDaemonPod(node, ds); shouldRun {
            // 将 DaemonSet 加入队列进行同步
            dsc.enqueueDaemonSet(ds)
        }
    }
}
```

同步过程中，控制器会执行以下操作：

1. **获取节点列表**：在 `syncDaemonSet` 函数中获取所有节点
2. **判断节点是否应该运行 Pod**：在 `podsShouldBeOnNode` 函数中判断
3. **创建 Pod**：在 `syncNodes` 函数中批量创建 Pod

```go
func (dsc *DaemonSetsController) podsShouldBeOnNode(
    node *v1.Node,
    nodeToDaemonPods map[string][]*v1.Pod,
    ds *apps.DaemonSet,
    hash string,
) (nodesNeedingDaemonPods, podsToDelete []string) {
    shouldRun, shouldContinueRunning := NodeShouldRunDaemonPod(node, ds)
    daemonPods, exists := nodeToDaemonPods[node.Name]

    switch {
    case shouldRun && !exists:
        // 如果节点应该运行 DaemonSet Pod 但还没有，则标记为需要创建
        nodesNeedingDaemonPods = append(nodesNeedingDaemonPods, node.Name)
    // ... 其他逻辑
    }
    return nodesNeedingDaemonPods, podsToDelete
}
```

创建 Pod 时，控制器会设置节点亲和性，确保 Pod 调度到目标节点：

```go
podTemplate := template.DeepCopy()
// 设置节点亲和性，确保 Pod 绑定到目标节点
podTemplate.Spec.Affinity = util.ReplaceDaemonSetPodNodeNameNodeAffinity(
    podTemplate.Spec.Affinity, nodesNeedingDaemonPods[ix])

// 创建 Pod
err := dsc.podControl.CreatePods(ctx, ds.Namespace, podTemplate,
    ds, metav1.NewControllerRef(ds, controllerKind))
```

#### 缩容操作：

当节点从集群中移除时，DaemonSet 控制器会在同步过程中检测到，并执行以下操作：

1. **检测节点是否存在**：在 `manage` 函数中，控制器会获取所有节点的列表
2. **清理不存在节点上的 Pod**：通过 `getUnscheduledPodsWithoutNode` 函数识别并删除分配给不存在节点的 Pod

```go
// 移除分配给不存在节点的未调度 Pod
podsToDelete = append(podsToDelete, getUnscheduledPodsWithoutNode(nodeList, nodeToDaemonPods)...)
```

3. **删除 Pod**：在 `syncNodes` 函数中批量删除 Pod

```go
deleteWait := sync.WaitGroup{}
deleteWait.Add(deleteDiff)
for i := 0; i < deleteDiff; i++ {
    go func(ix int) {
        defer deleteWait.Done()
        if err := dsc.podControl.DeletePod(ctx, ds.Namespace, podsToDelete[ix], ds); err != nil {
            dsc.expectations.DeletionObserved(dsKey)
            if !apierrors.IsNotFound(err) {
                klog.V(2).Infof("Failed deletion, decremented expectations for set %q/%q", ds.Namespace, ds.Name)
                errCh <- err
                utilruntime.HandleError(err)
            }
        }
    }(i)
}
deleteWait.Wait()
```

4. **更新状态**：最后，控制器会更新 DaemonSet 的状态，确保状态与实际情况匹配

```go
func (dsc *DaemonSetsController) updateDaemonSetStatus(ctx context.Context, ds *apps.DaemonSet, nodeList []*v1.Node, hash string, updateObservedGen bool) error {
    // 获取节点到 Pod 的映射
    nodeToDaemonPods, err := dsc.getNodesToDaemonPods(ctx, ds)
    if err != nil {
        return fmt.Errorf("couldn't get node to daemon pod mapping for daemon set %q: %v", ds.Name, err)
    }

    // 计算各种状态指标
    var desiredNumberScheduled, currentNumberScheduled, numberMisscheduled, numberReady, updatedNumberScheduled, numberAvailable int
    now := dsc.failedPodsBackoff.Clock.Now()
    for _, node := range nodeList {
        shouldRun, _ := NodeShouldRunDaemonPod(node, ds)
        scheduled := len(nodeToDaemonPods[node.Name]) > 0

        if shouldRun {
            desiredNumberScheduled++
            if scheduled {
                currentNumberScheduled++
                // 计算其他状态指标...
            }
        } else {
            if scheduled {
                numberMisscheduled++
            }
        }
    }

    // 更新状态
    err = storeDaemonSetStatus(ctx, dsc.kubeClient.AppsV1().DaemonSets(ds.Namespace), ds, desiredNumberScheduled, currentNumberScheduled, numberMisscheduled, numberReady, updatedNumberScheduled, numberAvailable, numberUnavailable, updateObservedGen)
    return err
}
```

### 4.3 删除 DaemonSet 工作负载 Pod 实例

DaemonSet 控制器在以下情况下会删除 Pod 实例：

1. **节点移除**：当节点从集群中移除时，控制器会删除该节点上的 Pod
2. **更新操作**：在滚动更新过程中，控制器会删除旧版本的 Pod
3. **节点选择器变化**：当节点不再满足 DaemonSet 的节点选择规则时，控制器会删除该节点上的 Pod
4. **Pod 失败**：当 Pod 处于 Failed 状态时，控制器会删除并重建该 Pod

以下是 `syncNodes` 函数中删除 Pod 的核心逻辑：

```go
func (dsc *DaemonSetsController) syncNodes(ctx context.Context, ds *apps.DaemonSet, podsToDelete, nodesNeedingDaemonPods []string, hash string) error {
    // ...
    deleteWait := sync.WaitGroup{}
    deleteWait.Add(deleteDiff)
    for i := 0; i < deleteDiff; i++ {
        go func(ix int) {
            defer deleteWait.Done()
            if err := dsc.podControl.DeletePod(ctx, ds.Namespace, podsToDelete[ix], ds); err != nil {
                dsc.expectations.DeletionObserved(dsKey)
                if !apierrors.IsNotFound(err) {
                    klog.V(2).Infof("Failed deletion, decremented expectations for set %q/%q", ds.Namespace, ds.Name)
                    errCh <- err
                    utilruntime.HandleError(err)
                }
            }
        }(i)
    }
    deleteWait.Wait()
    // ...
}
```

### 4.4 DaemonSet 版本管理

DaemonSet 使用 ControllerRevision 来管理版本历史，实现版本回滚功能：

1. **版本创建**：当 DaemonSet 模板发生变化时，控制器会创建新的 ControllerRevision
2. **版本清理**：根据 `revisionHistoryLimit` 参数清理旧的版本历史
3. **版本回滚**：通过回滚到指定的 ControllerRevision 实现 DaemonSet 的版本回滚

以下是 `constructHistory` 函数的核心逻辑：

```go
func (dsc *DaemonSetsController) constructHistory(ctx context.Context, ds *apps.DaemonSet) (cur *apps.ControllerRevision, old []*apps.ControllerRevision, err error) {
    // ...
    currRevision := maxRevision(old) + 1
    switch len(currentHistories) {
    case 0:
        // Create a new history if the current one isn't found
        cur, err = dsc.snapshot(ctx, ds, currRevision)
        if err != nil {
            return nil, nil, err
        }
    default:
        cur, err = dsc.dedupCurHistories(ctx, ds, currentHistories)
        if err != nil {
            return nil, nil, err
        }
        // Update revision number if necessary
        if cur.Revision < currRevision {
            toUpdate := cur.DeepCopy()
            toUpdate.Revision = currRevision
            _, err = dsc.kubeClient.AppsV1().ControllerRevisions(ds.Namespace).Update(ctx, toUpdate, metav1.UpdateOptions{})
            if err != nil {
                return nil, nil, err
            }
        }
    }
    return cur, old, err
}
```


旧文档链接：[DaemonSet 逻辑结构分析](https://bbs.huaweicloud.com/blogs/417158)
