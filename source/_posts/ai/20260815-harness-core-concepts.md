---
title: 什么是Harness
date: 2026-08-15 22:00:00
tags:
  - Agent
  - Harness
  - LLM
  - Context Engineering
  - Prompt Engineering
categories:
  - AI
  - Agent
---

> 本文基于公众号「小林coding」的《鹅厂面试官："你怎么看 Harness Engineering？" 我："就是给大模型套缰绳"》一文，按其"概念型知识"四段式模板重组成一份可速查、可面试复习的文档。原文核心论点：**AI 工程的重心两年里三次转移——Prompt → Context → Harness，三者层层包含而非替代；模型决定 Agent 的天花板，Harness 决定它能不能落地、稳定交付。**

## 一、一句大白话描述概念

**Harness（驾驭工程 / 马具工程）就是除模型本身之外，agent 系统里"决定它能不能在真实世界里稳定把事干成"的那一整套工程化装置**——你可以把它理解成给大模型套上的一副"缰绳 + 马鞍 + 缰绳扣"：模型是那匹有劲儿但野的马，Harness 是把这股劲儿收拢、导向、控住、兜底的全部机关。

一句话等式：

- **`Agent = Model + Harness`**
- **`Harness = Agent − Model`**

翻译成人话：在一个 AI Agent 系统里，除了模型本身，**几乎所有决定它能不能稳定交付的东西，都属于 Harness**。模型负责"聪明"，Harness 负责"靠谱"。

## 二、图示

### 1. 三次重心转移：层层包含，边界一层比一层大

```
Prompt Engineering   让模型「听懂」你        (对"指令"的工程化)
        │  被包含
        ▼
Context Engineering  让模型「知道」该用什么信息  (对"输入环境"的工程化)
        │  被包含
        ▼
Harness Engineering  让模型「做对」一连串的事    (对"整个运行系统"的工程化)
        │
        ▼
   Agent = Model + Harness

关系：Prompt ⊂ Context ⊂ Harness （Prompt 是 Context 的一部分，
      Context 是 Harness 的一部分）
```

### 2. Harness 六层组件全景（输入侧 / 动作侧 / 校验侧）

```
                  ┌─────────────────────────────────────┐
   输入侧          │ ① 上下文精细化管理  模型本轮该看什么？ │
                  │ ② 记忆与状态管理  模型跨轮该记什么？   │
                  └─────────────────────────────────────┘
                                  │
                  ┌─────────────────────────────────────┐
   动作侧          │ ③ 工具系统        模型用什么动手？     │
                  │ ④ 任务执行编排    模型下一步该干啥？    │
                  └─────────────────────────────────────┘
                                  │
                  ┌─────────────────────────────────────┐
   校验侧          │ ⑤ 评估与观测  做得好不好有没有尺子？  │
                  │ ⑥ 约束与恢复  出错了能不能爬起来？     │
                  └─────────────────────────────────────┘
```

### 3. ReAct 主循环：Harness 包着的"思考—行动—观察"

```
   ┌──────────────────────────────────────────────┐
   │                HARNESS (外层框架)              │
   │                                                │
   │   while not done:                             │
   │      thought  = LLM.think(context)   ← 模型    │
   │      action   = pick_tool(thought)   ← 模型    │
   │      obs      = run_tool(action)     ← 程序/工具│
   │      context  = ②记忆 + ①上下文筛选 + ⑤观测    │
   │      if ⑥检测到越界/失败: 约束恢复, 重启循环    │
   │                                                │
   └──────────────────────────────────────────────┘
```

## 三、知识点

### 1. Harness 是什么：等式与边界

- **词源**：Mitchell Hashimoto 在 2026-02-05 博客《My AI Adoption Journey》第五步提出 "Engineer the Harness"；随后 OpenAI 发文《Harness engineering: leveraging Codex in an agent-first world》为其背书。
- **核心定义（原话）**："每次当你发现 Agent 犯了一个错误，就花点时间去工程化一个解决方案，让它永远不会再犯同样的错误。"——这不是一次性设计，而是**用每一次翻车去加固环境**的复利过程。
- **边界**：`Prompt` 是对"指令"的工程化；`Context` 是对"输入环境"的工程化；`Harness` 是对"整个运行系统"的工程化。边界一层比一层大。
- **复利效应（原话）**："每一次 Agent 犯错，环境就会变强一点；环境变强一点，Agent 下一次就更少犯错……这套做法的威力在于它是「复利」的。"

### 2. AI 工程的三次重心转移

| 阶段 | 解决什么 | 一句话本质 | 关键手段 |
|------|----------|------------|----------|
| Prompt Engineering | 让模型"听懂" | 不是命令模型，而是**塑造它的概率空间** | 设计/调提示词 |
| Context Engineering | 让模型"知道" | 不是给得更多，而是**按需给、分层给、在正确时机给** | 召回(RAG)/压缩/组装 |
| Harness Engineering | 让模型"做对"一连串事 | 对**整个运行系统**的工程化 | 六层组件（见下） |

> 三者**非替代、是包含**：Prompt 解决"表达"，Context 解决"信息"，Harness 解决"执行"。Prompt 是 Context 的一部分，Context 是 Harness 的一部分。

### 3. Harness 六层组件模型

| 分组 | 层 | 它在解决的一句话问题 | 典型实现 |
|------|----|----------------------|----------|
| 输入侧 | ① 上下文精细化管理 | 模型这一轮该看到什么？ | 渐进式披露、检索/压缩/组装 |
| 输入侧 | ② 记忆与状态管理 | 模型跨轮该记住什么？ | 文件系统外化、状态机 |
| 动作侧 | ③ 工具系统 | 模型用什么动手？ | MCP、Function Call |
| 动作侧 | ④ 任务执行编排 | 模型下一步该干啥？ | ReAct / Plan-and-Execute |
| 校验侧 | ⑤ 评估与观测 | 做得好不好有没有尺子？ | Eval 集、Trace（LangSmith/Langfuse） |
| 校验侧 | ⑥ 约束与恢复 | 出错了能不能爬起来？ | 上下文重置、回滚、人工兜底 |

- **① 上下文精细化**：上下文窗口有限，要在正确时机把最相关信息喂进去。"按需给、分层给"。
- **② 记忆与状态**：跨轮记忆不能全塞回上下文（会撑爆），要外化到文件/数据库。
- **③ 工具系统**：模型"动手"的能力来源；MCP 让"任意工具用同一种方式接到任意 Agent"。
- **④ 执行编排**：ReAct（`Thought → Action → Observation` 循环）是最基础形态；长任务常加"重新规划检查点"。
- **⑤ 评估与观测**：Eval 集是"尺子"，Trace 是"足迹"——没度量就没法迭代。
- **⑥ 约束与恢复**：agent 跑偏时兜底，避免一路错到底。

### 4. Harness 五大难点 + 对应原则（作者总结口诀）

> 口诀：**"重启胜过修补，生产验收分家，与其催模型不如改环境，规则宁缺毋滥，技术债天天还"**

| 难题 | 现象 | 对应原则 | 落地做法 |
|------|------|----------|----------|
| ① 上下文焦虑 | 模型快撑不住时着急收尾、跳过验证（Cognition 称 Context Anxiety） | 重启胜过修补 | 状态沉到文件里，旧上下文窗口直接丢弃重开（Context Reset） |
| ② 自评偏乐观 | 模型自己评价自己总是分高 | 生产和验收必须分离 | Planner/Generator/Evaluator 三角，验收方独立 |
| ③ 失败工程师干啥 | 总想"让模型更努力" | 别问模型能不能更努力，要问环境还缺什么 | 改环境而非催模型 |
| ④ 规范文件越长越糊涂 | AGENTS.md 越长越没人看、越易偏离 | 规则文件宁缺毋滥 | OpenAI 把 AGENTS.md 控在约 100 行做索引 |
| ⑤ AI slop | 模型模仿歪代码，库慢慢腐烂（OpenAI 称 AI 代码泔水） | 技术债每天让后台 Agent 自动还 | Golden Principles：人类经验写成规则沉库，后台 Agent 自动扫偏离并开修复 PR |

### 5. 反直觉发现

- **老技术反而最稳**：Agent 对被称为"boring"的老技术（组合性好、API 稳定、训练数据里出现得多）掌握得最好。新潮框架/黑魔法反而容易翻车。
- **别迷信"让模型更聪明"**：长链路任务里，瓶颈往往不在模型智商，而在"环境有没有把坑填平"。

### 6. 💡 个人见解

- 上一篇整理了 **Agent = LLM + 工具 + 循环**，本篇的 `Agent = Model + Harness` 其实是同一件事的**两种视角**：前者从"能力构成"看（大脑/手脚/循环），后者从"工程责任"看（模型负责聪明，Harness 负责靠谱）。落地一个生产级 Agent，真正的功夫 80% 都花在 Harness 这半边——工具接稳、上下文管好、出错了能爬起来。
- 对你我写业务代码而言，**Harness 思维最实用的三点**：① 把长任务的状态外化到文件（别全赖上下文窗口）；② 让"生成"和"验收"分开（自己 review 自己等于没 review）；③ 每次线上翻车，顺手把防护写进规则文件，别只修这一次——这就是文里说的"复利"。

> ⚠️ **学习提示**："AGENTS.md 控 100 行""六层组件"等为作者归纳的实操经验，面试讲"思路与原则"即可，勿把数字当铁律；"Prompt ⊂ Context ⊂ Harness"是概念边界的直觉理解，严格说三者工程上常有交叠，不必咬死包含关系；词源时间（2026-02-05 等）以原文引用为准。

## 四、代码逻辑分析

### 1. Agent = Model + Harness 主循环（伪代码）

```python
class Harness:
    def __init__(self, model, tools, memory, evals):
        self.model = model          # 模型：负责 think / 决定动作
        self.tools = tools          # ③ 工具系统
        self.memory = memory        # ② 记忆与状态
        self.evals = evals          # ⑤ 评估与观测

    def run(self, goal):
        context = self._build_context(goal)   # ① 上下文精细化
        while not self._is_done(context):
            thought = self.model.think(context)        # 模型：思考
            action = thought.decide_tool_call()        # 模型：选工具+参数
            obs = self.tools.run(action)               # 程序：执行（④编排触发）
            context = self.memory.update(context, thought, action, obs)  # ②回填
            if self._guardrails_breached(context):     # ⑥约束与恢复
                context = self._recover(context)        # 重启/回滚
            self.evals.record(context)                 # ⑤记录 trace
        return self._deliver(context)
```

### 2. 上下文重置（Context Reset，Anthropic 做法）

状态外化到文件，旧窗口直接丢，换新窗口接着干——避免"上下文焦虑"导致的仓促收尾。

```text
任务进行到一半，上下文快撑爆
  → 把当前进度写进 claude-progress.txt（状态外化）
  → 丢弃旧上下文窗口，开一个干净窗口
  → 新窗口先读 claude-progress.txt，再继续
  → 模型不再"急着收尾跳过验证"，因为进度已落盘、可续跑
```

```python
def context_reset(progress_file, model, goal):
    save_progress(progress_file, current_state)   # 状态外化到文件
    fresh_window = new_context_window()           # 干净窗口
    fresh_window.load(read_progress(progress_file))  # 重读进度
    return model.continue(fresh_window, goal)     # 接着干
```

### 3. 生产 / 验收分离（Planner / Generator / Evaluator）

针对"自评偏乐观"，让验收方独立于生成方，分数才可信。

```text
Planner    : 拆解任务、列计划        （不写最终交付）
Generator  : 按计划产出结果          （只生产）
Evaluator  : 独立按 Eval 集打分/挑错  （只验收，看不到自己写的答案）
  → 若 Evaluator 不通过，回 Generator 重做，直到通过
```

### 4. 黄金原则自动还债（Golden Principles）

把人类经验写成规则沉入库，后台 Agent 持续扫描偏离并自动开修复 PR，对抗 AI slop。

```python
def golden_principles_loop(repo, principles):
    for diff in watch_pull_requests(repo):
        violations = scan(diff, principles)      # 扫偏离
        if violations:
            pr = open_fix_pr(repo, violations)    # 后台 Agent 自动开修复 PR
            notify_human(pr)                       # 人只做最终确认
```

> 小结：Harness 不是某个具体框架或库，而是一种**工程立场**——把"让 agent 稳定交付"的责任，从"指望模型更聪明"转移到"把运行环境工程化到位"。模型决定天花板，Harness 决定能不能落地。
