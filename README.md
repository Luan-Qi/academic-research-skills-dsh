# academic-research-skills-dsh

[![Upstream ARS](https://img.shields.io/badge/version-v3.23.0-blue?label=upstream%20ARS)](https://github.com/Imbad0202/academic-research-skills/releases/tag/v3.23.0)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/license-CC%20BY--NC%204.0-lightgrey)](https://creativecommons.org/licenses/by-nc/4.0/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.x-green)](https://github.com/deepseek-ai/deepseek-harness)

[English](#english) · [中文](#中文)

把 Claude Code 的 [Academic Research Skills (ARS)](https://github.com/Imbad0202/academic-research-skills)
**v3.23.0** 完整移植为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件。

这是一次**完整移植**，不是节选：5 个技能、35 个模式、43 个提示角色，连同上游的
`shared/`、`scripts/`、`docs/`、`examples/`、`audits/` 一并随包分发，
所以**模型能读到的 1,693 条路径引用全部可解析**（0 悬空）。

| | 数量 |
|---|---|
| 模型可调用技能 | **5** — `deep-research` / `academic-paper` / `academic-paper-reviewer` / `academic-pipeline` / `sr-screener` |
| 用户可调用命令 | **39** 个 `/ars-*`，覆盖 **全部 35 个模式** |
| 提示角色 | 43 个 `agents/*.md`（默认内联运行，与上游一致） |
| 确定性脚本 | `scripts/` 632 个 Python 文件（引用核验 gate、引用核查、token 守恒…） |
| 跟踪的上游版本 | **v3.23.0**（2026-10-03） |

> **署名 / Attribution**：本项目是 ARS 的 DSH 移植，内容与方法衍生自 Cheng-I Wu
> （[Imbad0202](https://github.com/Imbad0202)）的
> [academic-research-skills](https://github.com/Imbad0202/academic-research-skills) v3.23.0，
> 遵循 **CC-BY-NC-4.0（仅限非商业用途）**。
> 全部改动逐条记录在 [PORTING-NOTES.md](PORTING-NOTES.md)（即许可证要求的修改声明），
> 另见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。
> 本移植未经上游维护、审核或背书。

## 安装

**要求**：DeepSeek Harness 0.1.x · PATH 上有 `pnpm` · Node ≥ 18。

```bash
dsh plugin --profile web add github:Luan-Qi/academic-research-skills-dsh

# 或从本地 checkout 安装（开发调试）
dsh plugin --profile web add /path/to/academic-research-skills-dsh
```

然后**重启 `dsh web`**。插件在启动时注册进技能目录，热加载不覆盖这一层。

**不需要**改 profile，也**不需要**往 `~/.dsh/skills/` 复制任何东西。

### 确认装好了

1. 启动日志里出现：
   ```
   [academic-research-skills-dsh] skill provider registered from ...
   ```
2. 技能目录里出现 5 个技能（`deep-research`、`academic-paper`、`academic-paper-reviewer`、
   `academic-pipeline`、`sr-screener`）。
3. 在输入框打 `/`，菜单里能看到 `ars-full`、`ars-plan`、`ars-reviewer`、`ars-sr-ta-screen` 等 39 个命令。

### 卸载

```bash
dsh plugin --profile web remove academic-research-skills-dsh
```

对账逻辑会同时把它从 `dsh.profile.bundles` 移除，无需手改配置。

## 使用

| 用法 | 操作 |
|---|---|
| 斜杠命令 | `/ars-plan`、`/ars-full`、`/ars-reviewer`、`/ars-sr-ta-screen` … |
| 技能注入 | `/deep-research`、`/academic-pipeline` 等技能名 |
| 模型自动路由 | 直接说“帮我做文献综述 / 审稿 / 写论文 / 筛选文献”等（技能描述里带触发词） |

命令清单见 [`commands/`](commands/)，模式总表见 [`MODE_REGISTRY.md`](MODE_REGISTRY.md)。

**改了技能文件不用重启。** 技能由磁盘支撑的 provider 交付：`list()` 只解析 frontmatter，
`get()` **每次加载都从磁盘重读正文**，`fs.watch` + `control.invalidate()` 负责在文件增删时
刷新目录。所以改 `SKILL.md`、改命令、增删命令文件都在下一次加载/刷新时生效。

## 两种交付方式

### A. 插件（默认，推荐）

就是上面的安装方式。零配置、可 `dsh plugin` 管理、随包升级。**绝大多数人用这个。**

### B. 用户技能（可选，需改 profile）

如果你希望这些技能以**常规用户技能**出现在 `~/.dsh/skills/`（在技能浏览器里归到
“用户技能（~/.dsh/skills）”分组），可以用附带的安装器：

```bash
node build/install-user-skills.mjs          # 安装/更新（幂等）
node build/install-user-skills.mjs --verify # 校验已安装的副本
node build/install-user-skills.mjs --uninstall
```

它会复制 5 个技能（目录 bundle）+ 39 个命令（**根级平铺**：这是 DSH 里用户可调用技能
唯一被发现的形态）+ 资源树，并写一份归属清单，重装时只动自己上次装的文件，
**不碰你已有的技能**。

> ⚠️ **代价必须知道**：
> 1. **体积约 24 MB / 1232 文件**（`scripts/` 独占 11.3 MB）。
> 2. **必须改写约 3,500 条引用**：DSH 给模型的基准是**技能目录**，而上游用**仓库根相对**
>    路径写 `shared/`、`scripts/`、`docs/`、`<其它技能>/agents/`。安装器只给
>    “在根能找到、在技能目录找不到”的引用加 `../`，改完会自查并报告无法解释的悬空。
> 3. 装完请**移除插件**：`user-dsh` 的 rank 是 400、插件 provider 是 600，
>    两份并存时用户技能那份会**静默遮蔽**插件那份。
> 4. **不需要改 profile。** `~/.dsh/skills` 本来就已被扫描：`web` 里由默认 agent preset 的
>    `skill-filesystem` 负责，TUI/headless 里由 base 的 host 行负责。
>    `@deepseek-ai/dsh-web-app` 关掉的只是 **host 平面**那一行，因为 web 把 agent 平面移到了
>    per-session 的 preset 里（厂商原话："the base host `skill-filesystem` row is disabled here
>    — presets own local discovery"）。
>    两份并存时用户技能那份会**静默遮蔽**插件那份。

细节、实测数据与回滚步骤见 [PORTING-NOTES.md](PORTING-NOTES.md) §2 P17 / P18。

## 学术诚信与能力边界（上游的诚实声明，原样保留）

移植不改变上游对自己能力的界定，这些是**你应该知道**的：

- **模拟评审面板没有发布权。** 它的输出是**给作者的反馈**，是人工判断的输入，不是替代品；
  上游按 Wang, Li et al. (2026) 的评审权威阶梯，刻意把面板放在最低一级。
- **当前实测的评审结果仍是 `NOT_CALIBRATED`。** 校准协议与语料清单存在，但**从未执行过**，
  因此不存在误差率数字；也不要从面板输出推导"接受概率"。
- **没有任何数值总分被映射到 Accept / Minor / Major / Reject**；判据是分维度的分类判断。
- **诚信检查有覆盖边界。** 它检查**稿件与所报告的过程**（引用是否存在、论点与出处是否对齐、
  所报告的方法、图表保真度、报告规范符合性），而**不验证实际执行**：
  无法确认程序真的做过、原始数据是否真实完整、分析是否可复现。
  **一份自洽的伪造研究可以通过全部检查**——这是上游明说的失败形态。
- **不替你做研究决策。** 不跑实验、不生成/替代/排序你的研究假设、
  不把"出稿速度"当成果；每一阶段都要你确认才前进。
- **禁止商业用途**，见下方许可条款。

完整的定位、明确拒绝的机制与"非目标"清单见上游 [`POSITIONING.md`](POSITIONING.md)。

## 与上游的差异

1. **不移植 hooks。** 上游的 `SessionStart` 播报与 `PreToolUse` 写范围守卫是 Claude Code 专属；
   DSH 没有 hook 系统，写保护由 DSH 自己的文件沙箱与权限策略承担。
   副作用一条：`shared/references/routing_core.md` 里“加载前就有路由核心”的那个载体消失，
   即**没有任何技能接住的请求不会经过路由守卫**——上游对无 hook 渠道也是这么记载的。
2. **命令层重写为 DSH 形式。** 上游斜杠命令依赖 `${CLAUDE_PLUGIN_ROOT}` 与 `$ARGUMENTS`
   两个 Claude Code 专属替换，DSH 都不做替换；本包的 39 个命令改用插件根相对路径，
   并从用户消息里取参数。
3. **宿主机制改为 DSH 名称。** `WebSearch`→`web_search`、`Read/Grep tool`→`read`/`grep`、
   `Agent tool`→`subagent tool`、`python3`→`python`、`~/.claude/skills/`→`~/.dsh/skills/` 等。
4. **技能目录位于包根**，与上游完全一致（`deep-research/`、`academic-paper/` …）。
   这不是美观问题：上游 Markdown 用 `<skill>/agents/x.md` 这类**仓库根相对**路径互引，
   把技能塞进 `skills/` 子目录会让引用大面积悬空。
5. **子代理降级（已知限制）。** DSH 的 `subagent` 工具对所有调用使用同一套工具集，
   因此上游“该角色只有 Read+Grep”的**运行时**白名单在 DSH 退化为**提示词层**约束。
   受影响的主要是 `sr-screener` 的双盲双审独立性主张，已在
   `sr-screener/references/orchestration.md` 中就地说明。

## 已知限制

| 限制 | 说明 |
|---|---|
| 模型分级 `ARS_MODEL_TIERING` | 上游该机制依赖“按角色选模型”的派发层；DSH 的 `subagent` 没有 per-call 模型参数（只有 `workflow` 的 `agent()` 支持）。**未验证。** |
| 跨模型验证 `ARS_CROSS_MODEL` | 脚本与传输代码都在包内，但需要自备凭据与传输。**未验证。** |
| DOCX / PDF 输出 | 需要外部二进制：`pandoc`（DOCX）与 `tectonic` 或 MiKTeX 的 `xelatex`（PDF）。没装就只能出 Markdown / LaTeX 源码。 |
| 中文字体 | `academic-paper/templates/latex_article_template.tex` 默认要求 `Noto Sans CJK TC`；若系统没有（例如只有 Microsoft JhengHei / SimSun / MingLiU），需改字体并启用被注释的 xeCJK 块、注掉 pdfLaTeX 风格的 `inputenc`/`fontenc`/`times`。 |
| 期刊/学校模板 | 上游只带 `format_profile` 的 schema 与合成示例，**不含任何真实期刊或机构模板**（这是上游 `POSITIONING.md` 明确记录的非目标）。投稿用的模板需自备。 |
| 上游溯源文件 | `docs/`、`CHANGELOG.md` 等保持上游原文（逐字节），其中会提到 `hooks/`、`pi/`、`.github/` 等本包未分发的路径。 |

## 确定性脚本与 Python 解释器

`scripts/` 随包分发（632 个文件），引用核验 gate、引用核查、token 守恒检查等 CLI 都可用，
无需另外 clone 上游。

**Windows 注意**：`python3` 常常是 Microsoft Store 的 0 字节占位符，会在脚本真正运行前失败。
请用 `py -3`，其次 `python`。三个 CLI 命令的包装里已写明这一点。

## 自检

```bash
npm run check            # 7 项本地门禁
npm run check:upstream   # 跑上游 116 个 lint 并分类（仅“所改表面的守卫回归”才失败）
```

`npm run check` 依次检查：命令无漂移、零悬空引用、注册与模式覆盖、行尾必须 LF、
编码完整（无非法 UTF-8 / 无未解释的 U+FFFD）、生成文件无漂移、内容锁未漂移。

`build/` 下的脚本：

| 脚本 | 作用 |
|---|---|
| `audit-refs.mjs` | 抽出模型能读到的每一条路径引用并逐条解析，报告悬空（支持 `--root` / `--layout`） |
| `validate-skills.mjs` | 用 mock host 真实调用 `lib/startup.js`，校验发布结果、frontmatter、资源锚点、宿主残留 token、模式覆盖 |
| `generate-commands.mjs` | 命令层唯一真源（39 条），`--check` 报漂移与孤儿 |
| `generate-repo-docs.mjs` | 生成 `.claude/CLAUDE.md`（逐字节抽取路由核心块）与 `agents/` 镜像 |
| `normalize-host.mjs` | 宿主 token 级替换规则表（幂等，含显式禁用项与原因） |
| `normalize-eol.mjs` | 行尾收敛到 LF（上游规范） |
| `check-encoding.mjs` | 非法 UTF-8 与未解释 U+FFFD 门禁 |
| `refresh-content-locks.mjs` | 报告/重钉上游的整文件 sha256 内容锁 |
| `run-upstream-lints.mjs` | 上游 lint 分类门禁 |
| `install-user-skills.mjs` | 可选的 `~/.dsh/skills` 安装器（见“两种交付方式 B”） |
| `verify-user-skills.mjs` | 校验用户技能副本是否可被 DSH 发现 |

发布前清单见 [RELEASE.md](RELEASE.md)。

## 重新同步上游

```bash
# 1) 用上游新版覆盖方法论层（技能目录 + shared/ + scripts/ + docs/ + examples/ + audits/ + evals/）
# 2) 重放移植层
node build/normalize-host.mjs        # 宿主 token 级替换（幂等）
node build/normalize-eol.mjs --write # 收敛到 LF（上游规范）
node build/port-edits.mjs            # 整段改写（一次性锚点；已在场会报 already applied）
node build/generate-commands.mjs     # 重新生成 39 个命令
node build/generate-repo-docs.mjs    # 重新生成 .claude/CLAUDE.md 与 agents/ 镜像
node build/refresh-content-locks.mjs --write   # 仅在确认差异都有意为之之后
npm run check && npm run check:upstream
```

注意：**不要**用 PowerShell 的 `Get-Content`/`Set-Content` 改写本仓库的文本文件——
那会把含 CJK 的文件写成非法 UTF-8（有损、不可逆）。用 `build/*.mjs` 里的 Node 脚本，
`npm run check` 的编码门禁会兜住这类事故。

## 许可与引用

**CC-BY-NC-4.0**：可再分发、可修改，**禁止商业用途**。
引用上游时请按上游 [CITATION.cff](CITATION.cff) 指引；引用本移植时请同时注明上游与本文档
[PORTING-NOTES.md](PORTING-NOTES.md)。

---

<a name="english"></a>

# English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that ports
Claude Code's [Academic Research Skills (ARS)](https://github.com/Imbad0202/academic-research-skills)
**v3.23.0** in full — 5 skills, all 35 modes, 43 prompt roles, and 39 `/ars-*` commands.

Upstream's `shared/`, `scripts/`, `docs/`, `examples/`, `audits/` and the referenced `evals/`
subtree ship with the package, so **every one of the 1,693 path references the model can follow
resolves**. Nothing was trimmed.

> **Attribution**: a DSH port of ARS by Cheng-I Wu
> ([Imbad0202](https://github.com/Imbad0202)), **CC-BY-NC-4.0** (non-commercial).
> Every change is itemised in [PORTING-NOTES.md](PORTING-NOTES.md) — the statement of changes
> the licence requires. Not maintained, reviewed, or endorsed by upstream.

## Install

Requires DeepSeek Harness 0.1.x, `pnpm` on PATH, Node ≥ 18.

```bash
dsh plugin --profile web add github:Luan-Qi/academic-research-skills-dsh
# restart `dsh web`
```

No profile edits, and nothing has to be copied into a scanned skill root. Confirm with the boot
line `[academic-research-skills-dsh] skill provider registered from …`, the five skills in the
skill list, and the 39 commands in the `/` menu.

Skills are served by a disk-backed provider: `list()` parses frontmatter, `get()` **re-reads each
body from disk on every load**, and `fs.watch` + `control.invalidate()` refresh the catalog when
files are added or removed — so **editing a skill file needs no restart**.

### Optional: install as plain user skills

`node build/install-user-skills.mjs` materializes everything under `~/.dsh/skills/` instead
(5 directory bundles + 39 flat command files). It rewrites ~3,500 references to `../` because DSH
anchors a skill at its own directory while upstream writes repo-root-relative paths, and it keeps
an ownership manifest so re-runs never touch your own skills. **Costs:** ~24 MB, and you must
remove the plugin afterwards (the `user-dsh` root ranks 400 and would silently shadow the
plugin's 600). **No profile change is needed:** `~/.dsh/skills` is already scanned — in `web` by
the default agent preset's own `skill-filesystem`, and in TUI/headless by the base host row. The
`disabled: true` you see on the host row in a `web` dump means *discovery moved to the per-session
preset plane* ("the base host `skill-filesystem` row is disabled here — presets own local
discovery"), not that user skills are off. See PORTING-NOTES §2 P17/P18.

## Differences from upstream

1. **No hooks.** Upstream's `SessionStart` announce and `PreToolUse` write-scope guard are
   Claude Code specific; DSH has no hook system. Consequence: a request that no skill picks up
   gets no routing guard.
2. **Command layer rewritten for DSH**, which has neither `${CLAUDE_PLUGIN_ROOT}` nor
   `$ARGUMENTS` substitution.
3. **Host mechanics renamed** to their DSH equivalents (`web_search`, `read`, `grep`,
   `subagent tool`), and `python3` → `python` because the Windows `python3` name is commonly a
   0-byte Microsoft Store stub.
4. **Skill directories sit at the package root**, as upstream. Load-bearing: upstream Markdown
   cross-references siblings as `<skill>/agents/x.md`.
5. **Subagent degradation (known limitation).** DSH's `subagent` tool uses one tool set for every
   call, so upstream's per-agent `Read`+`Grep` allowlist becomes a prompt-level constraint. This
   chiefly affects `sr-screener`'s two-reviewer independence claim, stated in place in
   `sr-screener/references/orchestration.md`.

Also unverified on DSH: `ARS_MODEL_TIERING` and `ARS_CROSS_MODEL`. DOCX/PDF output needs
`pandoc` and (`tectonic` or MiKTeX's `xelatex`).

## Checks

```bash
npm run check            # 7 local gates: drift, dangling refs, coverage, LF, UTF-8, locks
npm run check:upstream   # 116 upstream lints, classified; fails only on a guard regression
```

Release checklist: [RELEASE.md](RELEASE.md).
