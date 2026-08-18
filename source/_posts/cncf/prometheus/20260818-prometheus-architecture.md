---
title: Prometheus 技术架构（PPT版）
date: 2026-08-18 09:08:00
tags:
  - prometheus
  - prometheus-operator
  - 监控
  - 架构
  - kubernetes
categories:
  - CNCF
  - Prometheus
  - 监控
---

## 一、技术架构总览

![第 1 页：技术架构总览](/images/20260818/prometheus-architecture/1-technical-architecture.png)

## 二、组件清单与 CRD

![第 2 页：组件清单与 CRD](/images/20260818/prometheus-architecture/2-component-ist.png)

## 三、服务发现过程

![第 3 页：服务发现过程](/images/20260818/prometheus-architecture/3-service-discovery-process.png)

## 四、组件流程细节

![第 4 页：组件流程细节](/images/20260818/prometheus-architecture/4-prometheus-component-process-details.png)

## 五、指标类型

![第 5 页：指标类型](/images/20260818/prometheus-architecture/5-metric-type.png)

## 六、样本数据格式

![第 6 页：样本数据格式](/images/20260818/prometheus-architecture/6-sample-data-format.png)

## 七、Prometheus-Adapter 架构

![第 7 页：Prometheus-Adapter 架构](/images/20260818/prometheus-architecture/7-prometheus-adapter.png)

## 八、告警：PrometheusRule + Alertmanager

![第 8 页：告警 PrometheusRule + Alertmanager](/images/20260818/prometheus-architecture/8-alertmanager.png)

## 九、多集群监控

![第 9 页：多集群监控](/images/20260818/prometheus-architecture/9-multi-cluster-monitoring.png)

## 十、KEDA 弹性伸缩

![第 10 页：KEDA 弹性伸缩](/images/20260818/prometheus-architecture/10-KEDA.png)
