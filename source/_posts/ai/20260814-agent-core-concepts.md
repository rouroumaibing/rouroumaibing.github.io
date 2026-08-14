---
title: Agent（智能体）概念梳理
date: 2026-08-14 10:19:00
tags:
  - Agent
  - LLM
  - MCP
  - Function Call
  - Skills
  - A2A
categories:
  - AI
  - Agent
---

> 本文基于公众号「小林coding」的《面试官："Agent 不就是 LLM 加点工具？"》一文，按其"概念型知识"四段式模板重组成一份可速查、可面试复习的文档。

## 一、一句大白话描述概念

**Agent（智能体）就是让大语言模型（LLM）在"思考—行动—观察"的循环里，自己决定调用工具、一步步把任务真正干完的系统**——LLM 负责"想"，工具负责"做"，循环让它能持续推进直到目标达成。

围绕 Agent，业界还沉淀了一整套"能力—连接—知识—协作"的概念体系：

- **Function Call**：让 LLM 学会"打电话"（调外部函数）
- **MCP**：统一插口（"AI 界的 USB-C"），标准化连接工具
- **Skills**：菜谱/方法论，教 Agent"怎么做"
- **A2A**：让多个 Agent 之间互相发现、委派任务

## 二、图示

概念分层全景：

```
                        LLM 大语言模型
                       （只会"说"，四大弊端）
                              │
                              ▼
                   Agent = LLM + 工具 + 循环
              （大脑·规划·记忆·工具 四模块闭环）
                   ┌──────────┴──────────┐
                   │                     │
        工作模式 / 与 Workflow 对比      底层技术三件套（分层互补）
     ┌─────────────────────┐      ┌─────────────────────┐
     │ Workflow vs Agent    │      │ Skills  知识层(菜谱) │
     │ ReAct 边想边做       │      │ MCP     连接层(USB-C)│
     │ Plan-and-Execute     │      │ Function Call 能力层 │
     │ Reflection 做完检查  │      └─────────────────────┘
     │ Multi-Agent 团队协作 │                │
     └─────────────────────┘                ▼
                                   A2A：Agent ↔ Agent 协作
                            （横向；MCP 负责竖向 Agent↔工具）
```

## 三、知识点

### 1. LLM 与 Agent 的区别

- **LLM 四大弊端**：①只会说不会做 ②没有记忆（上下文窗口外即归零）③不会用工具（无法实时查数据/调 API）④不会规划（被动响应，无法自主拆解任务）。
- **Agent 定义**：`Agent = LLM + 工具 + 循环`。三关键词：**LLM**（大脑）、**工具**（手脚）、**循环**（思考→行动→观察→再思考）。
- **Agent 四模块**：大脑(LLM) / 规划 / 记忆(短期+长期) / 工具。

### 2. Agent 与 Workflow 的区别

- **核心区别：谁在控制流程**。
  - Workflow：控制权在代码（步骤写死、确定可复现、token 省，约为 Agent 的 1/4）。
  - Agent：控制权在 LLM（动态灵活但不确定、token 贵）。
- **实践建议（Anthropic）**：从最简单方案开始；固定步骤 / 高可靠场景用 Workflow，开放 / 不确定场景用 Agent；生产中多为**混合架构**（流水线上局部挂 Agent）。

### 3. Agent 的四种工作模式

- **ReAct（边想边做）**：`Thought → Action → Observation` 循环，最基础，几乎所有框架底层都在用；透明可审计，但 token 贵、可能陷入循环。
- **Plan-and-Execute（先想后做）**：先列完整计划再逐项执行，规划只做一次，token 约为 ReAct 的 1/5；缺点是计划僵化，可加"重新规划检查点"。
- **Reflection（做完再检查）**：自我反思（同 Agent 切审查者角色）或双 Agent 互审；适合代码 / 法律 / 论文等高质量要求场景。
- **Multi-Agent（团队协作）**：多个专业化 Agent 分工协作（规划 / 搜集 / 编码 / 测试）；框架有 LangGraph、CrewAI、OpenAI Agents SDK、AutoGen。
  - ⚠️ Anthropic 提醒：**不要过早引入多 Agent**，单 Agent 够用就别上。
  - 💡 **个人见解**：Multi-Agent 的关键不只是"跑多个 Agent 进程"，更在于**引入多个大模型**——不同模型训练数据、擅长方向各异。落地思路：先按各模型的能力偏向做评估，再为每个 Agent 设定差异化的角色提示词，让它们各司其职、协同完成任务（例如推理强的模型负责规划、代码强的模型负责编码、知识面广的模型负责搜集）。这比单纯"同一模型多角色"更能发挥模型间的互补性。
- 四者**非互斥**，常组合使用（Multi-Agent 内部可能用 ReAct，整体再挂 Reflection）。

### 4. Function Call（函数调用）

- 让 LLM 不仅能生成文字，还能输出"我想调某函数、参数是这些"的结构化指令；**真正执行函数的是你的应用代码**，LLM 只产出调用请求。
- **四步流程**：①定义函数(JSON 描述) ②模型判断要调哪个、提取参数 ③应用执行 ④把结果回填给 LLM 生成回答。
- **定位**：Agent 的原子操作 / 基石，几乎所有主流大模型都支持（格式略有差异）。

### 5. MCP（Model Context Protocol）

- 比喻："AI 界的 USB-C"——统一标准，让任意 AI 应用用同一种方式连任意工具 / 数据源。
- **核心价值**：把 `N×M` 的定制集成降到 **`N+M`**（每应用实现一次 Client，每服务实现一次 Server，自动对接）；工具可被动态发现。
- **三角色**：**Host**（AI 应用，发起方）、**Client**（住 Host 内、负责通信的"翻译官"）、**Server**（暴露具体工具能力）。Anthropic 于 2024-11 开源。

### 6. Skills（技能）

- 自然语言指令文件（常为 `SKILL.md`），教 Agent"在什么场景、按什么方法、遵循什么规范完成任务"——类比"菜谱"。
- **本质**：提示词扩展，**完全在 Agent 上下文窗口内生效，不涉及外部调用**，与 Function Call / MCP 不同。
- **价值**：把领域专家经验（代码审查、SQL 优化、客服话术）编码成可复用模块，团队共享。

### 7. Function Call / MCP / Skills 三者区别

| 维度 | Function Call | MCP | Skills |
|------|---------------|-----|--------|
| 解决的问题 | LLM 怎么跟外部函数交互 | 用统一标准管理大量工具 | Agent 怎么获得领域知识 |
| 运行位置 | 你的应用程序中 | 外部 MCP Server | Agent 上下文窗口内 |
| 技术本质 | API 协议 | 通信标准 | 提示词扩展 |
| 标准化 | 厂商间不统一 | 统一开放标准 | 暂无跨厂商统一标准 |

**关系**：Function Call 是底层能力；MCP 在其上做标准化包装；Skills 在另一维度指导"何时 / 如何用工具"。三者分层互补（**能力层 / 连接层 / 知识层**）。

### 8. A2A（Agent-to-Agent Protocol）

- Google 于 2025-04 Cloud Next 发布，联合 50+ 合作伙伴；解决 **Agent 与 Agent 之间的发现与协作**——MCP 管不了这块（MCP 是竖向 Agent↔工具，A2A 是横向 Agent↔Agent）。
- **核心概念**：
  - **Agent Card**：JSON 名片，描述身份 / 能力 / 擅长领域 / 认证要求；
  - **Task**：任务生命周期（创建 → 处理中 → 完成 / 失败）；
  - **Message & Artifact**：过程消息 + 最终制品（如分析报告）。
- **生态现状（截至 2026 年初）**：仍早期，远未成事实标准，但前景被看好。Agent 协议三层：**FC（调用）→ MCP（连工具）→ A2A（连 Agent）**。

> ⚠️ **学习提示**：文中 token 比例（1/4、1/5）是经验性示意值，面试时讲"量级差异"即可，勿咬死数字；"Skills 暂无统一标准"基本成立，但 Agent Skills 生态已出现，趋势走向标准化；"MCP 建立在 Function Call 之上"应理解为 MCP 调用工具时底层仍走"模型输出结构化请求→程序执行"的同构机制，二者不在同一抽象层。

## 四、代码逻辑分析

### 1. Function Call 四步流程（以查天气为例）

**定义函数**（告知 LLM 有哪些工具可用）：

```json
{
  "name": "get_weather",
  "description": "查询指定城市的当前天气",
  "parameters": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "城市名，如 上海" }
    },
    "required": ["city"]
  }
}
```

**调用与执行逻辑**：

```text
用户: 上海今天天气如何？
  → LLM 判断需要调用 get_weather，输出参数 {"city": "上海"}   // 第②步：模型判断 + 提取参数
  → 你的应用代码解析参数，真实调用天气 API，得到 "多云 22°C"   // 第③步：应用执行（LLM 不参与）
  → 应用把结果回填给 LLM
  → LLM 生成自然语言回答："今天上海天气多云，约 22°C"          // 第④步：生成回答
```

> 关键：**LLM 只产出结构化调用请求，真正执行在第③步由你的程序完成**。

### 2. SKILL.md 示例（Code_Review_Expert）

```markdown
---
name: Code_Review_Expert
description: 当用户要求代码审查时使用，输出结构化审查意见
triggers:
  - 代码审查
  - review this code
---
# 代码审查专家

## 工作流程
1. 阅读变更 diff，理解意图
2. 按以下维度检查：安全性 / 性能 / 可读性 / 边界条件
3. 输出结构化意见：问题等级（严重 / 警告 / 建议）+ 位置 + 修复建议
4. 不修改代码，只给建议
```

Skills 可通过 `allowed-tools` 声明可用工具，甚至打包脚本，指导 Agent 去调 MCP / 发起 Function Call。

### 3. ReAct 循环逻辑（伪代码）

```python
while not done:
    thought = llm.think(context)              # 思考：下一步做什么
    action = thought.decide_tool_call()       # 行动：选定工具 + 参数
    observation = run_tool(action)            # 观察：执行工具，拿到结果
    context += (thought, action, observation) # 回填上下文，进入下一轮
# 直到 thought 判断任务完成
```

### 4. MCP 三角色调用时序

```text
用户提问
  → Host 通过 Client 发现可用 MCP Server 与工具
  → LLM 决定调用某工具
  → Client 向对应 Server 发请求
  → Server 执行操作并返回结果
  → LLM 基于结果生成回答
```
