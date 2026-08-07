---
title: 当创建一个 PVC 后，Kubernetes 会发生什么？
date: 2026-08-07 17:31:37
tags:
  - k8s
  - PV
  - PVC
  - CSI
  - 源码分析
categories:
  - CNCF
  - k8s
  - storage
---

## 一、背景

    外部存储接入 Kubernetes 的方式主要有两种：In-Tree 和 Out-of-Tree：

* **In-Tree** 是指存储驱动的源码都在 Kubernetes 代码库中，与 Kubernetes 一起发布、迭代、管理，这种方式灵活性较差，且门槛较高。
* **Out-of-Tree** 是指存储插件由第三方编写、发布、管理，作为一种扩展与 Kubernetes 配合使用。Out-of-Tree 主要有 FlexVolume 和 CSI 两种实现方式，其中，FlexVolume 因为其命令式的特点，不易维护和管理，从 Kubernetes v1.23 版本开始已被弃用。因此 CSI 已经成为 Kubernetes 存储扩展（ Out-of-Tree ）的唯一方式。

  外部存储最终的效果是将存储（磁盘、obs、nas 盘等）挂载到容器中被业务使用，所以一般包括存在两个过程：
* **attach** 是将存储介质在指定虚拟机上绑盘，部分存储介质才需要 attach 操作，比如容器中使用块存储，大致流程是 1）需要先调用 openstack 接口，将某块 evs 绑到某个虚拟机上，成为虚拟机设备；2）在将存储设备挂载到容器目录上
* **mount** 将某个存储挂载到对应文件系统上，是操作系统层面的行为，所有的存储介质挂载到容器中都需要 mount 阶段，比如容器中使用 nas 或者 obs，本质上就是执行 nfs 命令将网络存储挂载到容器目录上

## 二、CSI 架构解读

    Kubernetes CSI 存储插件的关键组件与推荐的容器化部署架构 ![CSI 架构](/images/20260807/bulmn/csi-architecture.png)

## 三、动态创建 Volume 执行过程

    以块类型存储为例，从声明 PVC 到 Pod 挂载卷成功时序图：

    ![动态创建 Volume 时序图](/images/20260807/bulmn/dynamic-volume-creation-flow.png)

### 一、涉及组件解读

* **PV Controller** ：负责处理集群中的 PVC/PV 对象，对 PVC/PV 对象进行状态转换，并根据需求进行数据卷的 Provision/Delete 操作（注：Static PV 不会触发 provisioner、Dynamic PV 才会触发 provisioner）
* **AD Controller** ：负责 VolumeAttachement 的生命周期管理，并通过 external-attacher 将设备挂载到目标节点或从目标节点卸载。VolumeAttachement 是控制块存储设备的 Attach/Detach 操作的逻辑对象。（注：可通过 kubelet 配置文件开关控制节点是否由 AD Controller 管理）。
* Kubelet 主要包含与存储相关的两个插件
  **1）** **Volume Manager**：管理存储卷的 Mount/Unmount 操作、卷设备的格式化等操作（注：如果当前节点并没有交给 AD Controller 管理，那么就是 volumeManager 负责管理 VolumeAttachement 的生命周期）
  **2）Volume Plugin** ：K8S 平台为存储提供商提供存储接入的插件接口，其中包含 in-tree 的多种存储插件和 out-tree 的两种存储插件。通过该插件机制进而为容器应用提供各种类型的存储。社区推荐的是 CSI 架构的扩展插件

### 二、涉及资源解读

* **PV：** PersistentVolume，集群级别的资源，由集群管理员 or External Provisioner 创建。PV 的生命周期独立于使用 PV 的 Pod，PV 的 .Spec 中保存了存储设备的详细信息。

```bash
kind: PersistentVolume
apiVersion: v1
metadata:
  name: pv-test
  labels:
    failure-domain.beta.kubernetes.io/region: cn-north-4
    failure-domain.beta.kubernetes.io/zone: cn-north-4a
  annotations:
    pv.kubernetes.io/provisioned-by: xxxx-provisioner #存储提供者
spec:
  capacity:
    storage: 10Gi
  csi:
    driver: disk.csi.everest.io
    volumeHandle: 698a99d8-xxx-xxxx-xxxx-ab80b1ecbf #使用的存储设备信息
volumeAttributes:
      everest.io/disk-mode: SCSI
      everest.io/disk-volume-type: ESSD
      storage.kubernetes.io/csiProvisionerIdentity: xxxx-provisioner
  accessModes:
    - ReadWriteOnce
  # 引用对象, 该pv由哪个pvc创建
  claimRef:
    kind: PersistentVolumeClaim
    namespace: test
    name: pvc-test
    uid: xxxx-xxxx-xxxx-22bf9101f0ce
    apiVersion: v1
  persistentVolumeReclaimPolicy: Delete
  storageClassName: csi-disk
  volumeMode: Filesystem
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: failure-domain.beta.kubernetes.io/zone
              operator: In
              values:
                - cn-north-4a
status:
  phase: Bound
  # available : 表示当前的pv没有被绑定
  # bound:      已经被pvc挂载
  # released:   pvc没有在使用pv, 需要管理员手工释放pv
  # failed：    资源回收失败
```

* **PVC：** PersistentVolumeClaim，命名空间（namespace）级别的资源，由用户 or StatefulSet 控制器（根据 VolumeClaimTemplate）创建。PVC 类似于 Pod，Pod 消耗 Node 资源，PVC 消耗 PV 资源。Pod 可以请求特定级别的资源（CPU 和内存），而 PVC 可以请求特定存储卷的大小及访问模式（Access Mode）。

```bash
kind: PersistentVolumeClaim
apiVersion: v1
metadata:
  name: pvc-evs-test
  namespace: test
  uid: xxxx-xxxx-xxxx-22bf9101f0ce
  labels:
    failure-domain.beta.kubernetes.io/region: cn-north-4
    failure-domain.beta.kubernetes.io/zone: cn-north-4a
  annotations:
    volume.kubernetes.io/selected-node: xxx.xxx.xxx.186
    everest.io/disk-volume-type: ESSD
    volume.kubernetes.io/storage-provisioner: xxxx-provisioner
spec:
  # ReadWriteOnce:被单个节点mount为读写rw模式
  # ReadOnlyMany  被多个节点mount为只读ro模式
  # ReadWriteMany 被多个节点mount为读写rw模式
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  volumeName: pv-test #绑定的pv name
  # 使用的sc类型
  storageClassName: csi-disk
  # 存储模式,包含Filesystem(文件系统)和Block（块设备）
  volumeMode: Filesystem
status:
  # Pending：pvc刚创建还未与pv绑定
  # Bound： pvc与pv完成绑定
  # Lost：对应的pv被删除
  phase: Bound
  accessModes:
    - ReadWriteOnce
```

* **SC：** StorageClass 是集群级别的资源，由集群管理员创建。SC 为管理员提供了一种动态提供存储卷的"类"模板，SC 中的 .Spec 中详细定义了存储卷 PV 的不同服务质量级别、备份策略等等。

```bash
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: csi-disk
parameters:
  csi.storage.k8s.io/csi-driver-name: disk.csi.everest.io
  csi.storage.k8s.io/fstype: ext4
  everest.io/disk-volume-type: SATA
  everest.io/passthrough: "true"
provisioner: xxxx-provisioner
# 回收策略, pvc和pv解绑,删除了pvc, pv里面的数据是否还保留
# Retain: 保留数据, 需要手工删除
# delete: pv删除
reclaimPolicy: Delete
# Immediate: pv创建好之后立马将pvc和pv进行绑定
# WaitForFirstConsumer: 延迟绑定，直到使用pvc的pod被调度到节点上
volumeBindingMode: Immediate
allowVolumeExpansion: true #是否允许扩容
```

### 三、涉及 CSI API 对象

* **CSINode**

1. 判断**外部 CSI 插件**是否注册成功。在 Node Driver Registrar 组件向 Kubelet 注册完毕后，Kubelet 会创建该资源，故不需要显式创建 CSINode 资源
2. 将 Kubernetes 中 Node 资源名称与三方存储系统中节点名称（nodeID）一一对应。此处 **Kubelet** 会调用**外部 CSI 插件** NodeServer 的 GetNodeInfo 函数获取 nodeID。
3. 显示卷拓扑信息。CSINode 中 topologyKeys 用来表示存储节点的拓扑信息，卷拓扑信息会使得 **Scheduler** 在 Pod 调度时选择合适的存储节点。

```bash
apiVersion: storage.k8s.io/v1
kind: CSINode
metadata:
  annotations:
    everest.io/node.localvolume.capacity: "null"
  name: xxx.xxx.xxx.186
  ownerReferences:
  - apiVersion: v1
    kind: Node
    name: xxx.xxx.xxx.186
    uid: 091cc415-b8bb-4173-8312-5f6318d4383f
  uid: fea2c180-99b8-4195-a966-3953b8bab16a
spec:
  # 节点上有哪些driver
  drivers:
  - allocatable:
      count: 58
    name: disk.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys:
    - failure-domain.beta.kubernetes.io/zone
  - name: proxy.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys: null
  - name: sfsturbo.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys: null
  - name: nas.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys: null
    ...
apiVersion: storage.k8s.io/v1
kind: CSINode
metadata:
  annotations:
    everest.io/node.localvolume.capacity: "null"
  name: xxx.xxx.xxx.186
  ownerReferences:
  - apiVersion: v1
    kind: Node
    name: xxx.xxx.xxx.186
    uid: 091cc415-b8bb-4173-8312-5f6318d4383f
  uid: fea2c180-99b8-4195-a966-3953b8bab16a
spec:
  # 节点上有哪些driver
  drivers:
  - allocatable:
      count: 58
    name: disk.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys:
    - failure-domain.beta.kubernetes.io/zone
  - name: proxy.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys: null
  - name: sfsturbo.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys: null
  - name: nas.csi.everest.io
    nodeID: 7d279bf8-c70f-4179-842e-5e501d591d17
    topologyKeys: null
    ...
```

* **CSIDriver**

1. 简化**外部 CSI 插件**的发现。由集群管理员创建，通过 kubectl get csidriver 即可得知环境上有哪些 CSI 插件。
2. 自定义 Kubernetes 行为，如一些外部 CSI 插件不需要执行卷挂接（VolumeAttach）操作，则可以设置 .spec.attachRequired 为 false。

```bash
apiVersion: storage.k8s.io/v1
kind: CSIDriver
metadata:
  name: disk.csi.everest.io
  uid: 5d33a29b-4bf1-4ab8-815f-e97b207b991e
spec:
  # 是否需要attache和mount，只有evs需要attach
  attachRequired: true
  podInfoOnMount: true
  requiresRepublish: false
  storageCapacity: false
  volumeLifecycleModes:
  - Persistent   #volume生命周期，持久模式
```

* **VolumeAttachment**

  AD Controller 创建一个 VolumeAttachment，而 External-attacher 则通过观察该 VolumeAttachment，根据其状态属性来进行存储的挂载和卸载操作。

```bash
apiVersion: storage.k8s.io/v1
kind: VolumeAttachment
metadata:
  annotations:
    csi.alpha.kubernetes.io/node-id: xxxx-xxxx-xxxx-5e501d591d17
  finalizers:
  - everest-csi-attacher/disk-csi-everest-io
  name: csi-d10b9f7e4dde469fa2b7f3461fcfef7862260883196647d6b7ae7bb17bc0e226
  uid: 665b740f-a544-4f3e-9953-00b8d186c548
spec:
  attacher: disk.csi.everest.io
  nodeName:xxx.xxx.xxx.186
  source:
    persistentVolumeName: pv-test
status:
  # 标记是否attached到节点上，attache后才能mount
  attached: true
  attachmentMetadata: #attach的设备信息
    bus: scsi
    device: /dev/sdg
```

## 四、存储拓展-延迟绑定

    Kubernetes 里面有两个绑定：

1. kube-schedule 将 Pod 和 Node 绑定
2. PVC Controller 将 PVC 和 PV 绑定。正常情况下，kube-schedule 绑定 Pod 和 Node 时候，如果 Pod 有 PVC，会等待 PVC 和 PV 绑定完成后根据 PV 所在的 az 选择 Node 过滤一部分不满足节点，然后再完成绑定 Pod 和 Node。延迟绑定场景，kube-schedule 先不等待 PVC 和 PV 绑定，先预调度 Node，然后把预调度结果写到 PVC 注解中，PVC 控制器获取到预调度 az 信息后，再完成 PV 创建和 PV 绑定。所以，延迟绑定时延迟了 PVC 和 PV 绑定阶段。

   StorageClass 延迟绑定作用字段：VolumeBindingMode

* **Immediate** ：表示一旦创建了 PersistentVolumeClaim 也就完成了卷绑定和动态制备（不参与调度）。 对于由于拓扑限制而非集群所有节点可达的存储后端，PersistentVolume 会在不知道 Pod 调度要求的情况下绑定或者制备。
* **WaitForFirstConsumer**  ：该模式将延迟 PersistentVolume 的绑定和制备，直到使用该 PersistentVolumeClaim 的 Pod 被创建。 PersistentVolume 会根据 Pod 调度约束指定的拓扑来选择或制备。 这些包括但不限于资源需求、 节点筛选器、 Pod 亲和性和互斥性、 以及污点和容忍度。

  ![延迟绑定流程](/images/20260807/bulmn/delayed-binding-flow.png)


旧文档链接：[当创建一个 PVC 后，Kubernetes 会发生什么？](https://bbs.huaweicloud.com/blogs/417161)
