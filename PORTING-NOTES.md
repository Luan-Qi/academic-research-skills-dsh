# PORTING-NOTES

> **Statement of changes (CC BY-NC 4.0).** This package is an adaptation of
> *Academic Research Skills* by Cheng-I Wu (Imbad0202), upstream **v3.23.0**.
> The methodology layer (`*/SKILL.md`, `*/agents/`, `*/references/`,
> `*/templates/`, `*/examples/`, `shared/`, `scripts/`, `docs/`) is redistributed
> substantially unchanged. All modifications are enumerated below and consist of
> (a) host-adaptation rewrites for DeepSeek Harness and (b) an added integration
> layer (`lib/`, `cordis.patch.yml`, `package.json`, `commands/`, `build/`,
> `README.md`, this file). Upstream's `hooks/` are intentionally not ported.
> No methodology rule, threshold, checklist item, or gate was weakened or removed.

本文档记录这次 DSH 移植的全部改动：**上游事实 → 上一版移植的坑 → 本次修法 → 验证证据**。
每条结论都有可复现的测量，命令写在末尾。

---

## 1. 移植清单（本包 = upstream v3.23.0 全量方法论层）

| 内容 | 数量 | 说明 |
|---|---|---|
| 技能 | 5 | `deep-research` 2.12.1 / `academic-paper` 3.3.1 / `academic-paper-reviewer` 1.11.1 / `academic-pipeline` **3.23.0** / `sr-screener` **1.0.0** |
| 模式 | 35 | 与 `MODE_REGISTRY.md` 逐条对齐 |
| 提示角色 | 43 | `agents/*.md`，默认内联运行 |
| `shared/` | 155 文件 / 1.67 MB | 契约、schema、评分量表、firm rules |
| `scripts/` | 632 文件 / 11.3 MB | 确定性校验（引用核验 gate、引用核查、token 守恒…） |
| `docs/` | 125 文件 / 4.6 MB | 设计规格，命令层的 `Mode reference:` 指向它们 |
| `examples/` `audits/` | 45 + 16 文件 | `shared/` 契约引用的模板与审计报告 |
| `evals/heldout/review_criteria_constructive_value/` | 15 文件 | `shared/` 引用的测量计划所在子树 |
| 命令 | **39** | 上游 16 个命令名全部保留 + 23 个新增，覆盖全部 35 个模式 |
| **未移植** | — | `hooks/`（DSH 无 hook 系统）、`.github/`（上游 CI）、`.claude-plugin/`（Claude Code 打包）、`tests/`、`tools/`、`pi/`、`plugin-evals*/`、其余 `evals/`、上游多语言 README 与 `GOVERNANCE.md` / `SECURITY.md` / `CONTRIBUTING.md` / `THIRD_PARTY.md` |

**验证结果（`node build/validate-skills.mjs`）**：磁盘支撑的 provider 发布 **5 技能 + 39 命令**，
44 个正文全部从磁盘读回并与盘上内容逐字节一致，35/35 模式有命令可达，
`opaque` 资源基准与宿主残留 token 检查全通过。交付机制见 §2 P17。

---

## 2. 上一版移植（`dsh-academic-research-skills`）的问题，逐条修复

用同一个审计脚本对两版做同尺度测量：

```bash
node build/audit-refs.mjs --root=<checkout> --layout=nested   # 上一版布局
node build/audit-refs.mjs                                      # 本包
```

| 指标 | 上一版 | 本包 |
|---|---|---|
| 上游基线 | v3.21.1 | **v3.23.0** |
| 扫描文件 | 172 | 224 |
| 路径引用总数 | 924 | 1,693 |
| **悬空引用（distinct）** | **211** | **0** |
| 缺失技能 | `sr-screener`、`shared/` | 无 |
| 命令数 | 16 | **39** |

上一版 211 条悬空引用的分布：`shared/` 68 · `scripts/` 66 · `docs/` 24 ·
`../` 14 · `academic-pipeline/` 12 · `deep-research/` 10 · `academic-paper/` 9 ·
`academic-paper-reviewer/` 5 · `reviewer/` 2 · `.claude/` 1。

### P1 版本漂移：`sr-screener` 整个技能缺失
- **事实**：上游 v3.23.0 把 `sr-screener` 作为第五个技能加入（#919），含 25 个文件、
  8 个模式、4 个角色、独立的 `sr-screener/scripts/`（stdlib Python）。上一版基线是
  v3.21.1，完全没有它；且 v3.22.x / v3.23.0 对 `academic-pipeline` 等 41 个文件的
  修订也一并缺失。
- **修法**：整包以 v3.23.0 重做。
- **验证**：`academic-pipeline/SKILL.md` 版本号 `3.21.1 → 3.23.0`；
  `sr-screener/SKILL.md` 存在且注册成功。

### P2 【影响最大】技能目录被塞进 `skills/`，导致引用大面积悬空
- **根因**：上游把五个技能目录放在**仓库根**，Markdown 之间用**仓库根相对**路径互引，
  例如 `academic-paper/agents/draft_writer_agent.md`、`shared/handoff_schemas.md`、
  `deep-research/references/openalex_api_protocol.md`。上一版改成 `skills/<name>/`，
  这些路径全部失效。
- **修法**：技能目录放回**包根**，与上游布局完全一致。
  **这是结构性修复**：本包同时把 `lib/startup.js` 的注册路径与 `resourceBase` 指向包根，
  所以既不用改上千条引用，也不依赖 `~/.dsh/skills/`。
- **验证**：`audit-refs.mjs` 的 1,693 条引用中 1,094 条由包根解析、368 条由技能目录解析、
  172 条由同级文件解析、2 条由 `shared/contracts/` 解析 → 悬空 0。
  （这也解释了上游自己的审计结果同样是 0：布局一致即自洽。）

### P3 `shared/` 未随包分发（68 条悬空）
- **事实**：技能正文里出现 **228 次** `shared/...` 引用，指向 **33 个以上**不同的
  `shared/` 文件（`handoff_schemas.md`、`collaboration_depth_rubric.md`、
  `contracts/reviewer/full.json`、`references/firm_rules.md` …）。上一版 README 明确写
  “`shared/` 需 clone 上游”，等于把这些规则排除在运行时之外。
- **修法**：整目录随包分发（155 文件 / 1.67 MB）。
- **验证**：`shared/` 前缀悬空引用 68 → 0。

### P4 `scripts/` 未随包分发（66 条悬空）＋ Python 解释器坑
- **事实**：命令包装让 agent 执行 `python3 scripts/ars_cache_invalidate.py $ARGUMENTS`，
  但 `scripts/` 不在包里 → 引用悬空且命令必然失败。
  另外本机 `python3` 指向 `WindowsApps\python3.exe`（Microsoft Store 的 0 字节占位符），
  真实解释器是 `python`（3.8）与 `py -3`（3.9，Anaconda）。上游 `hooks/run_guard.sh`
  花 240 行专门处理这个坑，正说明它是真实存在的。
- **修法**：`scripts/` 随包分发（632 文件）；所有 `python3 ` 调用改为 `python `（19 处）；
  三个 CLI 命令额外写明“优先 `py -3`，其次 `python`；Windows 上 `python3` 常是 Store 占位符”。
- **验证**：`scripts/` 前缀悬空 66 → 0；`validate-skills.mjs` 的 hygiene 检查
  会抓出任何以 `python3` 开头的调用。

### P5 `docs/` 未随包分发（24 条悬空）
- **事实**：命令层的 `Mode reference:` 指向 `docs/design/*.md`（如
  `/ars-cache-invalidate` → `docs/design/2026-05-21-v3.10-182-promote-citation-gate-spec.md`）。
- **修法**：`docs/` 随包分发（125 文件 / 4.6 MB），保持原字节不变，作为上游溯源。

### P6 命令层残留 Claude Code 专属替换
- **事实**：上游 `commands/ars-*.md` 含 **41 处** `${CLAUDE_PLUGIN_ROOT}` 与
  **3 处** `$ARGUMENTS`。二者都是 Claude Code 的文本替换变量，DSH 都不做替换：
  路径会变成字面量 `${CLAUDE_PLUGIN_ROOT}/MODE_REGISTRY.md`，参数会变成字面量 `$ARGUMENTS`。
- **修法**：命令层重写。`${CLAUDE_PLUGIN_ROOT}/` 前缀去掉（路径变为插件根相对，可解析）；
  `${CLAUDE_PLUGIN_ROOT}` 单独出现时改为 “the plugin root”；
  `$ARGUMENTS` 改为 “`<args from the user's message>`” 并在 CLI 命令里说明
  “DSH 不做参数替换，请从用户消息里取”。
- **验证**：hygiene 检查 0 命中；`commands/` 与生成器 `--check` 零漂移。

### P7 命令生成器会“反噬”已修好的包装
- **事实**：上一版 `scripts/regenerate-commands.mjs` 逐字搬运上游命令正文，
  既不处理 `${CLAUDE_PLUGIN_ROOT}` 也不处理 `$ARGUMENTS`。也就是说重跑生成器会把
  手工修好的包装重新改坏，而当时仓库里**没有漂移检查**，没人会发现。
- **修法**：`build/generate-commands.mjs` 成为命令层唯一真源，内含清洗逻辑，
  并提供 `--check`（比对清单与落盘文件，报告 DRIFT 与孤儿文件）。`npm run check` 会跑它。

### P8 只有 16/35 个模式可达
- **事实**：上游只提供 16 个斜杠命令，而 `MODE_REGISTRY` 有 35 个模式。
  `deep-research` 的 `full/quick/review/lit-review/fact-check/systematic-review/socratic`、
  reviewer 的另外 5 个模式、`sr-screener` 的 8 个模式、以及 pipeline 的 resume，都只能靠
  模型自动路由，用户无法点名调用。
- **修法**：命令表补齐到 **39 个**：
  - 保留上游 16 个命令名（习惯与上游文档继续可用）；
  - 新增 23 个：`ars-dr-*` 7 个、`ars-reviewer-*` 5 个、`ars-paper-full`、`ars-pipeline`、
    `ars-resume`、`ars-sr-*` 8 个。
- **验证**：`validate-skills.mjs` 解析 `MODE_REGISTRY.md` 的表格，
  断言 **每个模式至少有一个命令可达**，且清单里没有虚构模式 → 35/35 通过。

### P9 `sr-screener` 用了 DSH 不存在的 workflow API
- **事实**：上游写 `Workflow({scriptPath: "<path>"})`。DSH 的 workflow 工具接的是
  **脚本体 + meta**（`script` / `meta` / `args`），**没有** `scriptPath` 参数。
- **修法**：就地改写为“读取生成脚本，把正文作为 `script` 传入，并配一个 `meta` 块”，
  同时把 workflow 运行记录的路径从 Claude Code 内部路径
  `~/.claude/projects/<...>/subagents/workflows/<runId>/journal.jsonl`
  改为“DSH 会随运行给出 journal 位置”。

### P10 引用了 DSH 不存在的 agent 安装路径与工具白名单
- **事实**：`sr-screener` 的安装说明要求把角色文件复制到 `.claude/agents/` 或
  `~/.claude/agents/`，并在 `agent_type` 里填 `academic-research-skills:screening_reviewer_agent`。
  DSH 没有文件系统 agent 根，也没有 `plugin:agent` 命名空间。
- **修法**：改为“把 `sr-screener/agents/screening_reviewer_agent.md` 的内容作为
  `subagent` 工具 prompt 传入；`agent_type` 填 `subagent` 或留空”。
- **附带降级（已在原文就地声明）**：DSH `subagent` 对所有调用使用同一套工具集，
  所以上游“该角色只有 Read+Grep”的**运行时**白名单在 DSH 退化为**提示词层**约束。
  双盲双审的独立性主张因此是提示词级，而非运行时强制——这正是上游
  `docs/CONTROL_AVAILABILITY.md` 对无白名单渠道的既定说法。

### P11 命令正文里残留“插件命名空间技能名”，且与包装自身指令互相矛盾
- **事实**：上游 13 个命令正文以一句 Claude Code 形式的加载指令开头：
  `First invoke the Skill tool with \`skill: "academic-research-skills:academic-paper"\`. Pass the mode …`。
  DSH 没有 `plugin:skill` 命名空间（技能名就是裸的 kebab-case），而且这句话与包装自己
  开头的“Call the `skill` tool with name `academic-paper`”**直接冲突**。
  该句还引用了 DSH 不存在的 `Skill tool`。上一版移植同样保留了这句。
- **修法**：生成器删除这句冗余加载指令，并把任何残留的 `academic-research-skills:` 前缀
  还原为裸技能名；同时把 “Resolve plugin resources from `` `${CLAUDE_PLUGIN_ROOT}` ``”
  这句改写成明确列出依赖目录的说法。
- **附带改进**：`validate-skills.mjs` 的 hygiene 检查因此扩充了三条规则
  （`academic-research-skills:`、`Skill tool` / `Read tool` / `Agent tool`、其他大写工具名），
  这类残留以后会被检查直接抓住，而不是靠肉眼发现。

### P12 缺少注册校验与引用校验
- **修法**：新增两个可执行检查（`build/` 下），并接进 `npm run check`：
  - `validate-skills.mjs`：用 mock host **真实调用 `lib/startup.js`**，校验注册数量、
    调用策略（命令必须 `modelInvocable:false`）、`resourceBase` 目录存在、
    frontmatter 未泄漏进正文、宿主残留 token、以及模式覆盖。
  - `audit-refs.mjs`：抽出所有能被模型跟随的路径引用并逐条解析，分
    “已解析 / 预期不存在（附理由）/ 悬空”三桶。

### P13 【功能性缺陷】`/ars-full` 被错映射成“写论文”而不是“全流水线”
- **事实**：上游 `commands/ars-full.md` 的正文是
  `Trigger the \`academic-pipeline\` orchestrator ... executes the complete academic
  research workflow (10-stage orchestration)`，它的 lint（`check_command_skill_dispatch.py`
  的 TARGETS 表）也明确写 `ars-full → academic-pipeline`。
  本包第一版把它映射成 `academic-paper` / `full` 模式——**用户输入 `/ars-full` 想跑全流程，
  实际只拿到写作阶段**。这是逐个核对上游 16 个命令的目标技能时发现的。
- **修法**：`ars-full` → `academic-pipeline` / `(pipeline)`；
  同时补一个 `ars-paper-full`（`academic-paper` / `full`），因为 `academic-paper` 的 full
  模式上游本来只靠触发词进入，把 `ars-full` 归位后它就没有显式入口了。命令总数 38 → **39**。
- **核对**：逐个比对上游 16 个命令正文里声明的技能与模式，**只有 `ars-full` 一处错**，
  其余 15 个（含 `ars-3w → deep-research`、`ars-reviewer → academic-paper-reviewer`、
  `ars-outline → outline-only`、`ars-abstract → abstract-only` 等）全部一致。

### P14 【可移植性坑】CRLF 让内容锁与工具白名单检查失效
- **事实**：上游 git 索引里所有文本文件都是 **LF**（`git ls-files --eol` 显示
  `i/lf w/crlf`，2844 个文件里 2776 个工作区是 CRLF），因为本机
  `core.autocrlf=true`，而上游的 `.gitattributes` 只钉了 `*.sh text eol=lf`，
  Markdown/Python/JSON 全走 `text=auto`。后果有两个，都很安静：
  1. `scripts/check_tools_allowlist.py` 故意**不做换行符归一化**读取那一行（它自己的注释写着
     “a bare `\r`/CRLF file therefore still fires the lint”），所以在 Windows 检出上必然报错
     ——上游 CI 跑在 Linux，永远见不到这个问题，**Windows 上的上游自己也会失败**。
  2. `check_pipeline_boundary_semantics.py` 的五个整文件 sha256 内容锁若按 CRLF 钉住，
     一旦重新检出或改成 `core.autocrlf=false` 就会**集体变红**——即“修好又自己坏掉”。
- **修法**：全树收敛到 LF（`build/normalize-eol.mjs`，1181 个文件），
  并新增本包的 `.gitattributes`（保留上游 `*.sh` 规则原文，再加 `* text=auto eol=lf`
  与二进制声明），把策略钉住、防止下次 clone 又漂回去；内容锁按 LF 重新钉。
- **验证**：`normalize-eol.mjs` 现在报告 0 个 CRLF；
  `check_tools_allowlist.py` 的 CRLF 类报错消失。

### P15 【回归修复】修掉我自己的三处过度改动，并让两个守卫重新生效
把上游 **116 个** `scripts/check_*.py` 全跑了一遍，抓出三处「改了但不该改 / 该改没改」：

1. **回退**：曾经把 agent 的冻结 `tools:` 前摄字段（`tools: Read, Write, Edit, Grep, Glob`
   / `tools: Read, Grep`）和引用它的散文改成小写。这个字段在 DSH 上**完全惰性**
   （没有 agent 注册表、没有 per-agent 白名单），改动**零收益**却破坏了上游的冻结形式
   检查，还让随包 agent 文件无谓地偏离上游镜像 → 已回退，并在
   `normalize-host.mjs` 里**保留为 disabled 规则 + 原因注释**，免得下一个人重蹈。
2. **补回守卫**：新增 `build/generate-repo-docs.mjs` 生成两个上游 lint 钉住的仓库级文件——
   - `.claude/CLAUDE.md`：把**路由核心块从 `shared/references/routing_core.md` 逐字节抽取**写入，
     于是 `check_routing_core_sync.py` 恢复工作（现在输出
     `OK (6 copies match shared/references/routing_core.md)`）。路由核心是承重机制
     （它决定请求直接进技能还是先问用户要哪个工作流，即 #133 防的那个失效），
     所以这个跨副本守卫值得救活。文件里同时写明它在 DSH 上是惰性的，
     并带 Suite version / Last Updated / 技能版本表（均由 CITATION.cff 与各 SKILL.md 动态读出，不会漂）。
   - `agents/`：把上游点名的 4 个可派发角色按**字节一致**同步过来
     （上游自己的说明就是 `cp <source> <mirror>`），`check_agents_mirror_sync.py` 恢复通过。
3. **内容锁按上游规定流程重钉**：新增 `build/refresh-content-locks.mjs`，
   先逐条报告哪几个面漂移，再 `--write` 才会移动 pin——移动 pin 等于宣称
   “每一字节差异都是有意为之”。

**结果**：新增 `build/run-upstream-lints.mjs` 把 116 个 lint 分类跑通并作为门禁：

| 分类 | 数量 |
|---|---|
| 通过 | **49** |
| **覆盖本包所改表面的 11 个守卫** | **全部通过，0 回归** |
| 已记录的不适用（每条附理由） | 15 |
| 未分类（缺 CLI 参数 / PyPI 依赖 / git 元数据） | 52 |

15 条“不适用”里，理由分四类：需要 Claude Code 打包（`.claude-plugin/`）、
需要 `.github/workflows/`、需要 `hooks/`、需要上游完整仓库（`tests/`、`evals/`、`pi/`、
多语言 README），以及**要求写入 DSH 不能有的两个替换变量**
（`check_command_skill_dispatch.py` 要求 `${CLAUDE_PLUGIN_ROOT}/` 与
`academic-research-skills:<skill>`；`check_v3_6_8_mark_read_commands.py` 要求
`python3 scripts/ars_mark_read.py $ARGUMENTS`）。后两条**在任何宿主正确的移植里都不可能通过**，
不是本包的缺陷。

### P16 自动化检查从 3 个扩到 7 个
`npm run check` 依次跑：命令无漂移、零悬空引用、注册与模式覆盖、行尾一致（0 CRLF）、
生成文件无漂移、内容锁未漂移、**编码完整（无非法 UTF-8 / 无未解释的 U+FFFD）**。
另有 `npm run check:upstream` 跑上游 lint 分类门禁。

### P17 【架构】从「嵌入注册」改成「磁盘支撑的 provider」
- **触发**：用户指出技能是 `source: 'runtime'` 的**嵌入技能**，而非常规用户技能，并列了三个后果。
- **核对结论（两处成立、一处需修正）**：
  1. **“每次启动要主动读取一次”** —— 这点需修正。两条路的启动成本相当（provider 也要在 discovery 时
     扫目录、解析 frontmatter）；而且 provider **每次加载都重读正文**，比嵌入注册读得**更多**。
     嵌入注册是“启动读一次、之后从内存取”。
  2. **“不能边运行边修改”** —— **成立**。`ctx.skills.register()` 收的是字符串 `content`，启动时快照，
     改盘上文件要重启才生效。
  3. **“不能中途关闭”** —— **成立**。运行期注册只在插件 fiber 被销毁（=重启）时释放；
     同层同名 runtime 注册还是 **first-wins**（重复注册拿到 no-op disposer），连“注销再注册”都做不到。
- **关键事实（决定了不能改成“常规用户技能”）**：`dsh --profile web --dump-config` 显示
  **`skill-filesystem` 这一行是 `disabled: true`**（由 `@deepseek-ai/dsh-web-app` 打的补丁）。
  也就是说 web profile 里**根本没有被扫描的技能根目录**，`~/.dsh/skills/` 不被读取
  （本会话技能目录里只有本插件的 5 个技能，用户原有的 `bys-travel-plan` 并未出现，可为证）；
  web 的技能入口是 **`dshmarket`**（可视化市场，自己 git clone 一份仓库到
  `~/.dsh/skills-management/market/`）。
  → “把它放进一个普通文件夹就当用户技能”在 web profile 里**做不到**，除非**覆盖 web app 的这条刻意补丁**
  （那还会连带启用其它目录扫描，等于改用户的 profile 语义，本包不做）。
- **修法**：改用 DSH 文档化的扩展点 `ctx.skills.registerProvider(...)`，在 `lib/startup.js` 里实现
  **磁盘支撑的 provider**：
  - `list()` 只解析 frontmatter，发布 5 技能 + 39 命令的摘要；
  - `get()` **每次从磁盘重读正文**（改盘上文件，下次加载即生效，无需重启）；
  - `fs.watch` 盯住包根、`commands/`、五个技能目录，**去抖 150ms** 后调 `control.invalidate()`，
    于是**新增/删除文件不用重启**也能进/出目录（watch 失败只降级为“无实时目录刷新”，正文仍从磁盘读）；
  - provider 随 `control.signal` 释放，watcher 一并关闭。
- **顺带修掉一个真实缺陷**：`@deepseek-ai/dsh-skill` 对 `directory` 型 `resourceBase` 会告诉模型
  “**把本技能提到的相对路径按这个基准目录解析**”。上游 ARS 实际用了**两个锚点**——
  裸 `references/x.md` 相对**技能自身目录**，而 `shared/`、`scripts/`、`docs/`、`<其它技能>/agents/x.md`
  相对**仓库根**。原实现把 `resourceBase` 设成技能目录，会让约四分之一引用解析到不存在的路径。
  现改为发布 `opaque` 型基准，**一句话同时点名两个锚点**（插件根 + 本文件所在目录），与上游双锚点约定一致。
- **验证**（`node build/validate-skills.mjs`）：发布 5 技能 + 39 命令；**44 个正文全部从磁盘读回并与盘上内容
  逐字节比对通过**；`opaque` 基准经检查同时含插件根与 `shared/` 锚点。可选实时重载探针
  （`ARS_DSH_LIVE_RELOAD_TEST=1`）实测：**新写入的命令文件无需重新注册即出现在目录中**，
  且 **watcher 在无重启的情况下触发了一次目录失效**。
- **代价**：`lib/startup.js` 从 ~120 行增到 ~290 行（自有的 frontmatter 解析 + 目录枚举 + watcher 生命周期），
  换来“改完即生效、增删即生效”。这是本包唯一一处自实现机制，理由已写在文件头。
- **需要重启一次**：插件是 `link:` 安装，profile 在启动时加载 bundle —— 要让新架构生效需重启 `dsh web`；
  此后的文件改动就不再需要重启了。

---

### P18 【交付方式·可选】把技能装成 `~/.dsh/skills/` 下的常规用户技能
- **触发**：用户明确要求技能必须是 `~/.dsh/skills` 下的**用户技能**（既不是嵌入技能，也不是 provider 交付）。
- **必须付的代价（先说清）**：
  1. **要改 profile**：web profile 里 `skill-filesystem` 被 `@deepseek-ai/dsh-web-app` 补丁成
     `disabled: true`，`~/.dsh/skills/` 根本不被扫描；不重新启用它，装进去也不会加载。
  2. **必须改写引用**：DSH 给模型的基准是**技能目录**（目录 bundle 的 `<root>/<name>`），
     而上游 ARS 用**仓库根相对**路径写 `shared/`、`scripts/`、`docs/`、`<其它技能>/agents/`。
     搬进用户技能根就必须给这一类引用加 `../`，否则重演 211 条悬空。
  3. **体积**：1232 文件 / 24.20 MB（`scripts/` 632 文件独占 11.3 MB，是主要开销）。
- **实现**：`build/install-user-skills.mjs`，可反复运行、可 `--uninstall`、可 `--verify`、`--slim`：
  - 复制 5 个技能（目录 bundle）+ `shared/`、`scripts/`、`docs/`、`evals/`、`examples/`、`audits/`
    与 `MODE_REGISTRY.md` 等根级文件；
  - `/ars-*` 包装**平铺**到根（`<root>/ars-plan.md`）：这是 DSH 里用户可调用技能唯一被发现的形态，
    而平铺文件的基准就是根，所以它们的 `MODE_REGISTRY.md` / `<skill>/SKILL.md` 引用**无需改写**；
  - 只给"在根能找到、在技能目录找不到"的引用加 `../`。上游还在**同一行**里混用了
    Markdown 链接相对于引用文件的写法，那种一律不动；
  - 写一份**归属清单** `.ars-user-skills.json`：重装只删自己上次装的、这次不再需要的文件，
    **绝不动用户自己的技能**（例如 `bys-travel-plan`）；
  - 装完自查一遍，并把"上游 CI / tests / hooks / 插件自身文件 / 示例路径"等
    **预期不存在**逐类列出，只有无法解释的才判失败。
- **本次实测**：复制 1232 文件 / 24.20 MB，**改写 3589 条引用（258 个文件）**，
  自查 **4 条无法解析、且全部属于已记录类别 → 0 条无法解释**。
- **已执行的环境切换（用户确认后）**：
  1. 备份 `~/.dsh/profiles/web/{cordis.patch.yml,package.json}`；
  2. 在 profile 的**用户补丁层**（`cordis.patch.yml`，在所有 bundle 层**之后**应用）写入
     `- id: skill-filesystem` / `disabled: false`，覆盖 web app 的关闭；
     用 `dsh --profile web --dump-config`（**不启动服务即可验证**）确认该行变成 `disabled: false`
     且 dump 里标注了补丁来源；
  3. `dsh plugin --profile web remove academic-research-skills-dsh` —— 对账逻辑自动把它从
     `dependencies` 与 `dsh.profile.bundles` 双双移除（已核对）。
- **切换后可发现性核对**（`build/verify-user-skills.mjs`，按 provider 的发现契约复刻）：
  发布 **6 个目录 bundle**（本包 5 个技能 + 用户原有的 `bys-travel-plan`，此前因该 provider 被关而一直没被加载）
  与 **39 个平铺命令**；13 个条目会被 provider 跳过并各打一条无害警告（6 个资源目录 + 4 个无 frontmatter 的
  说明文件 + 非 `.md` 文件）。
- **回滚**：`Copy-Item <备份> cordis.patch.yml -Force`，再
  `dsh plugin --profile web add <本包绝对路径>`，
  必要时 `node build/install-user-skills.mjs --uninstall`。

---

## 3. 宿主适配规则表（`build/normalize-host.mjs`，16 条生效 + 3 条显式禁用，112 处命中 / 41 文件）

只作用于五个技能目录与 `shared/`；`docs/`、`CHANGELOG.md` 等上游溯源文件保持**逐字节不变**。

| 规则 | 命中 | 说明 |
|---|---|---|
| `python3` → `python` | 19 | Windows Store 占位符坑 |
| `WebSearch` / `WebFetch` → `web_search` / `web_fetch` | 45 | DSH 工具名 |
| `AskUserQuestion` → `ask_user_question` | 8 | 规则本身是否定式（“不要用问答工具，选项写在正文”），予以保留 |
| `Read tool` / `Grep tool` / “Read and Grep tools” | 6 | DSH 小写工具名；这些是模型**真的要执行**的工具引用 |
| ~~agent frontmatter `tools:` 白名单~~ | 0 | **已禁用**（见 P15-1）：字段在 DSH 惰性，改动零收益且破坏上游冻结检查 |
| `Agent tool` → `subagent tool` | 5 | DSH 派发工具名 |
| SKILL.md 的 routing-discipline 说明 | 5 | 原文说“不加载 `.claude/CLAUDE.md`”，改为 DSH 注册路径的说法 |
| `fresh Claude Code session` → `fresh DSH session` | 3 | |
| `~/.claude/skills/` → `~/.dsh/skills/` | 1 | |
| 其他 Claude 专属断言（模型别名、`/insight`、`/model`、fallback 提示、团队章节措辞等） | 15 | 逐条改写，保留机制描述，去掉宿主专属细节 |

另有 `build/port-edits.mjs` 处理 7 处**整段改写**（token 替换无法表达），
每条锚点要求**恰好命中一次**，否则报错退出——上游文本位移会被立刻发现，而不是静默跳过。
命令层另有一套 4 条清洗规则（删冗余加载指令、去命名空间前缀、改写资源解析说明、
去 `$ARGUMENTS`），见 §2 P11。

**规则设计原则**：只改“在 DSH 上会**错**”的东西，不改风格、不改方法；零收益的改动一律回退。
所有改写都在脚本里留了 `why` 字段说明理由。

---

## 4. 已知限制与降级（诚实清单）

1. **没有 hooks（按要求）**。因此没有 `SessionStart` 播报，也没有 `PreToolUse` 写范围守卫；
   写保护完全依赖 DSH 自己的文件沙箱与权限策略。副作用一条：
   `shared/references/routing_core.md` 里“加载前就有路由核心”的那个载体消失，
   所以**没有任何技能接住的请求不会经过路由守卫**——这与上游对无 hook 渠道的记载一致，
   已在文件里就地写明。
2. **子代理工具白名单退化为提示词级**（见 P10）。受影响的主要是 `sr-screener` 的
   双盲双审独立性主张。
3. **模型分级 `ARS_MODEL_TIERING` 在 DSH 上能力受限**。上游该机制依赖“按角色选模型”
   的派发层；DSH 的 `subagent` 工具没有 per-call 模型参数（只有 `workflow` 的
   `agent()` 支持 `provider`/`model` 覆盖）。相关文档已去掉 Claude 专属断言，
   但**本包未验证**该开关在 DSH 上的实际行为。
4. **跨模型验证 `ARS_CROSS_MODEL` 未验证**。`scripts/` 与传输脚本都在包内、
   机制描述也已清理宿主断言，但需要自备凭据与传输，本次未跑通。
5. **`format-convert` 的 DOCX/PDF 需要外部二进制**：`pandoc`（DOCX）与
   `tectonic` 或 MiKTeX 的 `xelatex`（PDF）。若未安装，只能产出 Markdown / LaTeX 源码。
6. **中文字体**：`academic-paper/templates/latex_article_template.tex` 默认写
   `\setCJKmainfont{Noto Sans CJK TC}`，而本机未安装该字体（只有 Microsoft JhengHei
   `msjh.ttc`、MingLiU、Microsoft YaHei、SimSun 等）；写中文论文需改字体并启用被注释的
   xeCJK 块、注掉 pdfLaTeX 风格的 `inputenc`/`fontenc`/`times`。
7. **43 个提示角色仍是内联运行**。DSH 没有 agent 注册表，所以上游 4 个“插件级 agent”的
   工具白名单机制不适用；角色文件随技能目录分发（并在 `agents/` 有字节一致的镜像），
   需要时可把内容作为 `subagent` prompt。
8. **上游自身的两处遗留问题**，本包尽量如实保留：
   - `scripts/_calibration_pdf_text.py` 含 1 个 U+FFFD，**上游同样如此**（字节完全一致），
     未改动以免掩盖问题（`check-encoding.mjs` 有具名 allowlist）。
   - `docs/RISK_REGISTER.md`、`docs/CONTROL_AVAILABILITY.md` 等文件会引用本包未分发的
     `hooks/`、`pi/`、`.github/` 路径，因此相关下游 lint 不适用（见 P15 表）。
9. **`evals/` 只带了被引用的子树**（15 文件），其余约 13 MB 的评测语料未随包，
   因此 `evals/...` 下的其他引用会指向上游仓库。
10. **未随包分发的上游仓库内容不影响运行时**：`tests/`（342）、`tools/`（6）、
    `plugin-evals*`（107）、`pi/`（4）、`.github/`（17）、`.claude-plugin/`（2）均为
    CI / 开发 / Claude Code 打包用途，方法论层不依赖它们。
11. **这些技能不是“文件夹用户技能”，而且在 web profile 里也做不到**（见 P17）。
    `@deepseek-ai/dsh-web-app` 把 `skill-filesystem` 补丁成 `disabled: true`，
    所以 web profile 没有扫描的技能根目录，`~/.dsh/skills/` 不被读取；web 的技能入口是 `dshmarket`。
    本包因此通过 provider 交付（正文每次从磁盘读、增删文件即生效），**不去覆盖 web app 的这条配置**——
    覆盖它会一并启用其它目录扫描，属于改用户的 profile 语义。
    如果你确实想要“普通文件夹技能”，可行做法是在 profile 的 `cordis.patch.yml` 里自行把
    `skill-filesystem` 的 `disabled` 去掉并给它配置 `customSkillDirs: [<本包根>, <本包根>/commands]`；
    代价是它也会开始扫描 `~/.dsh/skills` 与项目 `.dsh/skills`，且与 web app 的既有意图相左，所以本包不默认这么做。
12. **两个资源锚点**：本包在 `resourceBase` 里同时声明“插件根”与“本文件所在目录”两个锚点。
    这是上游 ARS 的既有约定（`shared/…` 相对仓库根，裸 `references/…` 相对技能目录），
    并非本包新增的歧义；`opaque` 型基准就是为这种情况准备的。

---

## 5. 构建期的一条教训（供维护者参考）

移植过程中，用 PowerShell 的 `Get-Content -Raw` + `Set-Content` 改写含中文的 Markdown，
会把文件写成**非法 UTF-8**：英文原样保留，而每个中日韩字符变成一个 U+FFFD。
这个变换是**有损的，无法逆向恢复**。本次共发生两次——第一次伤了 5 个文件
（丢弃并从上游重放流水线修好），第二次伤了本文件（393 个字符丢失，只能整篇重写）。

**因此本包的所有文本改写都由 Node 脚本完成**（`build/*.mjs`，
`readFileSync`/`writeFileSync` utf8），不使用 shell 重定向或 `Set-Content`。
并且新增 `build/check-encoding.mjs` 接进 `npm run check`：它用
`TextDecoder('utf-8', { fatal: true })` 抓非法 UTF-8，再对 U+FFFD 做全树扫描
（唯一允许项是上游那个文件，附具名理由）。这样同类事故会在下一次检查时就暴露，
而不是等到有人打不开文件才发现。

---

## 6. 复现与自检

```bash
# 全部自检（命令漂移 / 悬空引用 / provider 与模式覆盖 / 行尾 / 生成文件 / 内容锁 / 编码）
npm run check

# 额外的实时重载实测（会临时写一个探针文件到 commands/ 再删除，默认不跑）
ARS_DSH_LIVE_RELOAD_TEST=1 node build/validate-skills.mjs

# 上游 lint 分类门禁（11 个覆盖本包所改表面的守卫必须通过）
npm run check:upstream

# 与上一版做同尺度对比
node build/audit-refs.mjs --root=<上一版路径> --layout=nested

# 重新同步 upstream
#   1) 用上游覆盖方法论层
#   2) 重放移植层
node build/normalize-host.mjs        # 宿主 token 级替换（幂等）
node build/normalize-eol.mjs --write # 收敛到 LF（上游规范）
node build/port-edits.mjs            # 整段改写（一次性锚点；已在场会报 already applied）
node build/generate-commands.mjs     # 重新生成 39 个命令
node build/generate-repo-docs.mjs    # 重新生成 .claude/CLAUDE.md 与 agents/ 镜像
node build/refresh-content-locks.mjs --write   # 内容锁重钉（仅在确认差异都有意为之之后）
npm run check
```

`build/` 下的脚本：

| 脚本 | 作用 |
|---|---|
| `normalize-host.mjs` | 宿主 token 级替换，幂等，规则表含 3 条显式禁用并注明原因 |
| `normalize-eol.mjs` | 行尾收敛到 LF（上游规范），`--write` 才落盘 |
| `port-edits.mjs` | 7 处整段改写，一次性锚点，命中数不为 1 即报错 |
| `generate-commands.mjs` | 命令层唯一真源（39 条），`--check` 报漂移与孤儿 |
| `generate-repo-docs.mjs` | 生成 `.claude/CLAUDE.md`（含逐字节抽取的路由核心块）与 `agents/` 镜像 |
| `refresh-content-locks.mjs` | 报告 / 重钉上游的整文件 sha256 内容锁 |
| `audit-refs.mjs` | 引用审计，支持 `--root` / `--layout` |
| `validate-skills.mjs` | 用 mock host 真实调用 `lib/startup.js`，校验注册、frontmatter、hygiene、模式覆盖 |
| `check-encoding.mjs` | 非法 UTF-8 与未解释 U+FFFD 门禁 |
| `run-upstream-lints.mjs` | 跑上游 116 个 lint 并分类，仅“所改表面的守卫回归”才失败 |
