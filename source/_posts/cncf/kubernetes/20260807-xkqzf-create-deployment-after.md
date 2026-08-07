---
title: 当创建一个 Deployment 后，Kubernetes 会发生什么？
date: 2026-08-07 15:57:06
tags:
  - k8s
  - Deployment
  - 源码分析
categories:
  - CNCF
  - k8s
  - workload
---

## 一、Deployment、ReplicaSet 和 Pod 的区别与联系

- **Pod 资源**：Pod 是 Kubernetes 集群内部部署的最基本的单位，是一组容器逻辑上的集合。
- **ReplicaSet 资源**：ReplicaSet 资源是官方用于替换 ReplicationController 资源，ReplicationController 用来确保工作负载 Pod 的副本数始终保持与期望值相同，会自动创建新的 Pod 实例或销毁多余实例来对齐工作负载期望副本数。具体由 kube-controller 进程中 ReplicaSet Controller 协程管理（pkg/controller/replicaset）。

![Pod、ReplicaSet 与 ReplicationController 关系](/images/20260807/xkqzf/pod-replicaset-rc-relationship.png)

ReplicaSet 跟 ReplicationController 没有本质的不同，只是 ReplicaSet 控制器在标签选择器上支持集合式 **selector**，除了可以定义键值对的选择形式，还支持 **matchExpressions** 字段，可以提供多种选择，如：In、NotIn、Exists、DoesNotExist 操作字符等。ReplicaSet（RS）与 ReplicationController（RC）资源，都是通过标签选择器 selector 来匹配 Pod 的标签，由对应的 controller 管理被匹配到的 Pod 的，ReplicationController 和 ReplicaSet 的 yaml 文件对比如下：

![ReplicaSet 与 ReplicationController YAML 对比](/images/20260807/xkqzf/replicaset-rc-yaml-comparison.png)

- **Deployment 资源**：虽然 ReplicaSet 控制器已经能够管理 Pod 的副本数量了，但是为了更好的解决应用升级、回滚问题，Kubernetes 引入了 Deployment 控制器。Deployment 控制器并不直接管理 Pod，而是通过管理 ReplicaSet 来间接管理 Pod，即：**Deployment 管理 ReplicaSet，ReplicaSet 管理 Pod。**

![Deployment 管理 ReplicaSet 管理 Pod](/images/20260807/xkqzf/deployment-replicaset-pod-relationship.png)

**Deployment 的主要功能如下：**

- 确保当前集群中 Deployment 工作负载有且只有 N 个 Pod 实例。
- 通过调整属性值 replicas 实现工作负载副本实例的伸缩。
- 通过更改模板中镜像名称来控制业务 Pod 实例的（重建/滚动）升级和回退。

![Deployment 主要功能](/images/20260807/xkqzf/deployment-main-functions.png)

## 二、Deployment 创建流程图

![Deployment 创建流程图](/images/20260807/xkqzf/deployment-creation-flow.png)

集群内（除 kube-apiserver 外）其他组件不直接参与与 etcd 通信，都是与 kube-apiserver 直接通信，Kubernetes 集群内各组件与 kube-apiserver 通信方式采用 List-watch 机制实现，其中采用 List 定期做全量同步更新，而 watch 机制采用非阻塞式长连接方式与 kube-apiserver 保持通信，具体流程如下：

1. 用户通过 kubectl 客户端发起创建 Deployment 资源对象请求至 kube-apiserver。
2. kube-apiserver 对请求用户鉴权、准入控制操作，然后将该请求资源事件写入到 etcd 存储中。
3. 考虑到 Deployment-controller 采用非阻塞式长连接 watch 机制实时获取 Deployment 资源对象信息，一旦集群中有 Deployment 变化（包括创建、更新、删除），则通过 kube-apiserver 获取 etcd 中相关 Deployment 资源对象。
4. kube-apiserver 将 Deployment 资源信息返回给 Deployment-controller 的 watch 接口长连接。
5. Deployment-controller 维护 Deployment 的生命周期，控制生成 ReplicaSet 资源对象，将 ReplicaSet 创建事件信息返回 kube-apiserver。
6. kube-apiserver 接收到 Deployment-controller 返回的创建 ReplicaSet 事件信息后，然后将创建请求事件写入到 etcd 存储中。
7. 考虑到 ReplicaSet-controller 采用非阻塞式长连接 watch 机制实时获取 ReplicaSet 资源对象信息，一旦集群中有 ReplicaSet 变化（包括创建、更新、删除），则通过 kube-apiserver 获取 etcd 中相关 ReplicaSet 资源对象。
8. kube-apiserver 将相关 ReplicaSet 资源信息返回给 ReplicaSet-controller 的 watch 接口长连接。
9. ReplicaSet-controller 通过获取的 ReplicaSet 资源信息生成对应的 Pod 资源对象模板，并将 Pod 创建信息通过调用 kube-apiserver 写入 etcd。
10. kube-apiserver 将待调度 Pod 创建事件信息写入到 etcd 做持久化存储。

## 三、更新 Deployment

Deployment 目前存在两种升级模式：销毁重建（Recreate）和滚动升级（RollingUpdate）。

### 3.1 Deployment 销毁重建方式升级示意图

![Deployment 销毁重建升级](/images/20260807/xkqzf/deployment-recreate-upgrade.png)

1. 获取 Deployment 的所有 ReplicaSet（包括旧的和新的）并同步它们的版本号。
2. 缩小旧 ReplicaSet 的规模。
3. 检查是否有旧的 Pod 仍在运行，如果有则等待它们停止运行。
4. 如果需要创建新的 ReplicaSet，则创建它并扩大它的规模，使其等于 Deployment 中指定的副本数。
5. 清理旧的 ReplicaSet。
6. 更新 Deployment 的状态。

### 3.2 Deployment 平滑滚动方式升级示意图

![Deployment 滚动升级](/images/20260807/xkqzf/deployment-rolling-update.png)

以下部分引用开源 Kubernetes 源码部分讲解流程：

1. 通过 **getAllReplicaSetsAndSyncRevision 函数** 方法获取 Deployment 的所有 ReplicaSet，包括新的 ReplicaSet 和旧的 ReplicaSet。

   ```go
   func (dc *DeploymentController) getAllReplicaSetsAndSyncRevision(ctx context.Context, d *apps.Deployment, rsList []*apps.ReplicaSet, createIfNotExisted bool) (*apps.ReplicaSet, []*apps.ReplicaSet, error) {
       _, allOldRSs := deploymentutil.FindOldReplicaSets(d, rsList)
       newRS, err := dc.getNewReplicaSet(ctx, d, rsList, allOldRSs, createIfNotExisted)
       if err != nil {
           return nil, nil, err
       }
       return newRS, allOldRSs, nil
   }
   ```

2. 调用 **reconcileNewReplicaSet** 方法尝试增加新的 ReplicaSet 的副本数，如果成功增加，则更新 Deployment 的状态。

   ```go
   func (dc *DeploymentController) reconcileNewReplicaSet(ctx context.Context, allRSs []*apps.ReplicaSet, newRS *apps.ReplicaSet, deployment *apps.Deployment) (bool, error) {
       if *(newRS.Spec.Replicas) == *(deployment.Spec.Replicas) {
           return false, nil
       }
       if *(newRS.Spec.Replicas) > *(deployment.Spec.Replicas) {
           scaled, _, err := dc.scaleReplicaSetAndRecordEvent(ctx, newRS, *(deployment.Spec.Replicas), deployment)
           return scaled, err
       }
       newReplicasCount, err := deploymentutil.NewRSNewReplicas(deployment, allRSs, newRS)
       if err != nil {
           return false, err
       }
       scaled, _, err := dc.scaleReplicaSetAndRecordEvent(ctx, newRS, newReplicasCount, deployment)
       return scaled, err
   }
   ```

   - 首先判断新的 ReplicaSet 的副本数是否与 Deployment 对象中指定的副本数相同，如果相同，则不需要进行任何操作，直接返回 false 和 nil。说明已经达到期望状态。
   - 如果新的 ReplicaSet 的副本数大于 Deployment 对象中指定的副本数，则需要进行缩容操作。说明 newRS 副本数已经超过期望值。
   - 如果新的 ReplicaSet 的副本数小于 Deployment 对象中指定的副本数，则需要计算需要创建的新副本数。计算原则遵守 maxSurge 和 maxUnavailable 的约束。

3. 调用 **reconcileOldReplicaSets** 方法尝试减少旧的 ReplicaSet 的副本数，如果成功减少，则更新 Deployment 的状态。

   ```go
   func (dc *DeploymentController) reconcileOldReplicaSets(ctx context.Context, allRSs []*apps.ReplicaSet, oldRSs []*apps.ReplicaSet, newRS *apps.ReplicaSet, deployment *apps.Deployment) (bool, error) {
       logger := klog.FromContext(ctx)
       oldPodsCount := deploymentutil.GetReplicaCountForReplicaSets(oldRSs)
       if oldPodsCount == 0 {
           return false, nil
       }
       allPodsCount := deploymentutil.GetReplicaCountForReplicaSets(allRSs)
       logger.V(4).Info("New replica set", "replicaSet", klog.KObj(newRS), "availableReplicas", newRS.Status.AvailableReplicas)
       maxUnavailable := deploymentutil.MaxUnavailable(*deployment)
       minAvailable := *(deployment.Spec.Replicas) - maxUnavailable
       newRSUnavailablePodCount := *(newRS.Spec.Replicas) - newRS.Status.AvailableReplicas
       maxScaledDown := allPodsCount - minAvailable - newRSUnavailablePodCount
       if maxScaledDown <= 0 {
           return false, nil
       }
       oldRSs, cleanupCount, err := dc.cleanupUnhealthyReplicas(ctx, oldRSs, deployment, maxScaledDown)
       if err != nil {
           return false, nil
       }
       logger.V(4).Info("Cleaned up unhealthy replicas from old RSes", "count", cleanupCount)
       allRSs = append(oldRSs, newRS)
       scaledDownCount, err := dc.scaleDownOldReplicaSetsForRollingUpdate(ctx, allRSs, oldRSs, deployment)
       if err != nil {
           return false, nil
       }
       logger.V(4).Info("Scaled down old RSes", "deployment", klog.KObj(deployment), "count", scaledDownCount)
       totalScaledDown := cleanupCount + scaledDownCount
       return totalScaledDown > 0, nil
   }
   ```

   - 获取了旧 ReplicaSet 中的 Pod 数量，如果 Pod 数量为 0，则无法再进行缩容，返回 false。
   - 获取了所有 ReplicaSet 的 Pod 数量，并检查是否可以进行缩容。（对于旧 ReplicaSet 副本不健康或者新的 ReplicaSet 副本已经正常运行则可以进行缩容）
   - 计算了最大可以缩容的 Pod 数量，考虑最大不可用 Pod 数量、新 ReplicaSet 不可用的 Pod 数量以及 Surge Pod 的数量等因素。如果最大可以缩容的 Pod 数量小于等于 0，则无法进行缩容，返回 false。

4. 如果所有 ReplicaSet 都已经更新完毕，即 DeploymentComplete 返回 true，则调用 **cleanupDeployment** 方法清理旧的 ReplicaSet。

   ```go
   func (dc *DeploymentController) cleanupDeployment(ctx context.Context, oldRSs []*apps.ReplicaSet, deployment *apps.Deployment) error {
       logger := klog.FromContext(ctx)
       if !deploymentutil.HasRevisionHistoryLimit(deployment) {
           return nil
       }
       aliveFilter := func(rs *apps.ReplicaSet) bool {
           return rs != nil && rs.ObjectMeta.DeletionTimestamp == nil
       }
       cleanableRSes := controller.FilterReplicaSets(oldRSs, aliveFilter)
       diff := int32(len(cleanableRSes)) - *deployment.Spec.RevisionHistoryLimit
       if diff <= 0 {
           return nil
       }
       sort.Sort(deploymentutil.ReplicaSetsByRevision(cleanableRSes))
       logger.V(4).Info("Looking to cleanup old replica sets for deployment", "deployment", klog.KObj(deployment))
       for i := int32(0); i < diff; i++ {
           rs := cleanableRSes[i]
           if rs.Status.Replicas != 0 || *(rs.Spec.Replicas) != 0 || rs.Generation > rs.Status.ObservedGeneration || rs.DeletionTimestamp != nil {
               continue
           }
           logger.V(4).Info("Trying to cleanup replica set for deployment", "replicaSet", klog.KObj(rs), "deployment", klog.KObj(deployment))
           if err := dc.client.AppsV1().ReplicaSets(rs.Namespace).Delete(ctx, rs.Name, metav1.DeleteOptions{}); err != nil && !errors.IsNotFound(err) {
               return err
           }
       }
       return nil
   }
   ```

5. 最后，调用 syncRolloutStatus 方法同步 Deployment 的状态。

   ```go
   func (dc *DeploymentController) syncRolloutStatus(ctx context.Context, allRSs []*apps.ReplicaSet, newRS *apps.ReplicaSet, d *apps.Deployment) error {
       newStatus := calculateStatus(allRSs, newRS, d)
       if !util.HasProgressDeadline(d) {
           util.RemoveDeploymentCondition(&newStatus, apps.DeploymentProgressing)
       }
       currentCond := util.GetDeploymentCondition(d.Status, apps.DeploymentProgressing)
       isCompleteDeployment := newStatus.Replicas == newStatus.UpdatedReplicas && currentCond != nil && currentCond.Reason == util.NewRSAvailableReason
       if util.HasProgressDeadline(d) && !isCompleteDeployment {
           switch {
           case util.DeploymentComplete(d, &newStatus):
               msg := fmt.Sprintf("Deployment %q has successfully progressed.", d.Name)
               if newRS != nil {
                   msg = fmt.Sprintf("ReplicaSet %q has successfully progressed.", newRS.Name)
               }
               condition := util.NewDeploymentCondition(apps.DeploymentProgressing, v1.ConditionTrue, util.NewRSAvailableReason, msg)
               util.SetDeploymentCondition(&newStatus, *condition)
           case util.DeploymentProgressing(d, &newStatus):
               msg := fmt.Sprintf("Deployment %q is progressing.", d.Name)
               if newRS != nil {
                   msg = fmt.Sprintf("ReplicaSet %q is progressing.", newRS.Name)
               }
               condition := util.NewDeploymentCondition(apps.DeploymentProgressing, v1.ConditionTrue, util.ReplicaSetUpdatedReason, msg)
               if currentCond != nil {
                   if currentCond.Status == v1.ConditionTrue {
                       condition.LastTransitionTime = currentCond.LastTransitionTime
                   }
                   util.RemoveDeploymentCondition(&newStatus, apps.DeploymentProgressing)
               }
               util.SetDeploymentCondition(&newStatus, *condition)
           case util.DeploymentTimedOut(ctx, d, &newStatus):
               msg := fmt.Sprintf("Deployment %q has timed out progressing.", d.Name)
               if newRS != nil {
                   msg = fmt.Sprintf("ReplicaSet %q has timed out progressing.", newRS.Name)
               }
               condition := util.NewDeploymentCondition(apps.DeploymentProgressing, v1.ConditionFalse, util.TimedOutReason, msg)
               util.SetDeploymentCondition(&newStatus, *condition)
           }
       }
       if replicaFailureCond := dc.getReplicaFailures(allRSs, newRS); len(replicaFailureCond) > 0 {
           // There will be only one ReplicaFailure condition on the replica set.
           util.SetDeploymentCondition(&newStatus, replicaFailureCond[0])
       } else {
           util.RemoveDeploymentCondition(&newStatus, apps.DeploymentReplicaFailure)
       }
       if reflect.DeepEqual(d.Status, newStatus) {
           // Requeue the deployment if required.
           dc.requeueStuckDeployment(ctx, d, newStatus)
           return nil
       }
       newDeployment := d
       newDeployment.Status = newStatus
       _, err := dc.client.AppsV1().Deployments(newDeployment.Namespace).UpdateStatus(ctx, newDeployment, metav1.UpdateOptions{})
       return err
   }
   ```

   maxSurge 和 maxUnavailable 计算原则：**maxSurge** 每次滚动升级允许超出所需规模的最大实例数，**maxUnavailable**：每次滚动升级允许的最大无效实例数。

## 四、源码结构（Kubernetes 1.24）

```
Deployment Controller Manager 启动流程
├── cmd/kube-controller-manager/controller-manager.go
│   └── main()
│       └── 调用 app.NewControllerManagerCommand()
│
├── cmd/kube-controller-manager/app/controllermanager.go
│   ├── NewControllerManagerCommand()
│   │   └── 创建 Cobra Command 对象
│   │       └── Run() 方法
│   │           └── 调用 NewControllerInitializers()
│   │
│   └── NewControllerInitializers()
│       └── 注册控制器列表
│           └── controllers["deployment"] = startDeploymentController
│
├── cmd/kube-controller-manager/app/apps.go
│   └── startDeploymentController()
│       └── 创建并启动 Deployment 控制器
│           └── deployment.NewDeploymentController(
│                   InformerFactory.Apps().V1().Deployments(),
│                   InformerFactory.Apps().V1().ReplicaSets(),
│                   InformerFactory.Core().V1().Pods(),
│                   ClientBuilder.ClientOrDie()
│               )
│
└── pkg/controller/deployment/deployment_controller.go
    └── NewDeploymentController()
        └── 创建 DeploymentController 实例
        ├── 初始化事件处理器
        ├── 注册 Informers 的 EventHandler
        │   ├── Deployment Informer
        │   ├── ReplicaSet Informer
        │   └── Pod Informer
        └── 返回控制器实例
```
