# RELEASE

发布清单。每一步都对应一个**已踩过或已验证**的坑，不是泛泛的"记得测试"。

---

## 0. 前置条件

| 要求 | 检查命令 |
|---|---|
| Node ≥ 18 | `node --version` |
| `pnpm` 在 PATH 上（DSH 用它管理 profile 插件） | `pnpm --version` |
| Python 3.9+（只有跑上游 lint 才需要；3.8 会因为 `str.removesuffix` 报错） | `py -3 --version` |
| DeepSeek Harness 0.1.x（只有验证安装才需要） | `dsh --version` |

---

## 1. 内容门禁（必须全绿）

```bash
npm run check            # 7 项：命令漂移 / 悬空引用 / 注册与模式覆盖 / 行尾 / 编码 / 生成文件 / 内容锁
npm run check:upstream   # 116 个上游 lint 分类；只有"覆盖所改表面的 11 个守卫"回归才失败
```

预期输出要点：

- `generate-commands.mjs --check` → `39 commands declared, 0 drifted`
- `audit-refs.mjs` → `UNRESOLVED : 0 distinct path(s)`
- `validate-skills.mjs` → `bodies loaded from disk: 44` 且 `OK — provider, frontmatter, resource anchors, hygiene, and mode coverage all pass.`
- `normalize-eol.mjs` → `found: 0 file(s) with CRLF`
- `check-encoding.mjs` → `OK — every text file is valid UTF-8 with no unexplained character loss.`
- `refresh-content-locks.mjs` → `all 5 locks match; nothing to do.`
- `run-upstream-lints.mjs` → `OK — all 11 guards covering edited surfaces pass.`

## 2. 内容卫生（发布前人工确认）

```bash
# 2a. 不应有本机绝对路径（仓库里不该出现你的用户名/磁盘路径）
grep -rn "C:\\\\Users\\\\\|D:\\\\Users\\\\" --include=*.md --include=*.mjs --include=*.json .

# 2b. 不应有真实密钥（匹配到的应该全是上游代码里的变量名，如 ANTHROPIC_API_KEY）
grep -rIn "sk-[A-Za-z0-9]\{16,\}\|vkey-\|BEGIN [A-Z ]*PRIVATE KEY\|ghp_[A-Za-z0-9]\{20,\}" .

# 2c. 版本与上游对齐
grep -m1 '"version"' package.json
grep -m1 '^## \[' CHANGELOG.md
grep -m1 '^version:' CITATION.cff
# 三者应一致（当前 3.23.0 = 跟踪的上游版本；package.json 的 1.0.0 是**本移植**的版本，可不同）
```

## 3. 仓库内容确认（提交前）

```bash
git status --short
git check-ignore -v commands/ars-plan.md        # 必须"没有被忽略"（命令层是本体，必须提交）
ls .gitattributes                                 # 必须存在，见下方 ⚠️
git ls-files --eol | grep -v 'w/lf' | head        # 提交后应只剩二进制文件不是 w/lf
```

**⚠️ `.gitattributes` 必须一起提交，且必须包含 `* text=auto eol=lf`。**
理由：上游的 `scripts/check_pipeline_boundary_semantics.py` 用**整文件 sha256** 锁住 5 个流水线
表面。若 Windows 用户 clone 时 `core.autocrlf=true` 把 Markdown 转成 CRLF，这些锁**必然全红**
（`scripts/check_tools_allowlist.py` 也会——它故意不做换行归一化读取）。本仓库的锁是按 LF 钉的。

同样必须提交的：`commands/`（39 个命令本体）、`build/`（自检脚本）、

`commands-src/`（生成器的上游正文来源）、`lib/`、`cordis.patch.yml`、`shared/`、`scripts/`、
`docs/`、五个技能目录、`evals/`（被引用的子树）、`audits/`、`examples/`。

**不应提交的**：`node_modules/`、`__pycache__/`、`*.pyc`（`.gitignore` 已覆盖）。

## 4. 首次提交与推送

```bash
git init
git branch -M main
git add -A
git -c user.name="Luan-Qi" -c user.email="Luan-Qi@users.noreply.github.com" \
    commit -m "feat: ARS v3.23.0 ported to DeepSeek Harness

5 skills, all 35 modes, 39 /ars-* commands, disk-backed skill provider.
Every one of the 1,693 path references resolves. See PORTING-NOTES.md for the
full statement of changes (CC-BY-NC-4.0 attribution requirement)."

git remote add origin https://github.com/Luan-Qi/academic-research-skills-dsh.git
git push -u origin main
```

> 提交身份若不正确，`git commit --amend --author="..."` 修正后再 push；
> 已经 push 的提交不要 amend，改用新提交。

## 5. 发布后的安装验证（**必做，别跳**）

**先跑 5-pre：本地打包预检。** 这一步不需要网络、不需要 push，却能在推之前抓住最致命的一类
bug —— `dsh plugin add github:` 是**先打包再安装**，所以 `package.json` 的 `files` 白名单
决定了别人到底收到什么；漏掉的文件不会在安装时报错，而是**在启动时**炸：

```bash
# 5-pre. 打包预检：清单里点名的运行时文件必须真的进包
npm pack --dry-run --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const f=JSON.parse(s)[0].files.map(x=>x.path);
  const need=['cordis.patch.yml','lib/startup.js','commands/ars-plan.md'];
  for (const n of need) console.log((f.includes(n)?'OK   ':'MISS ')+n);
  console.log('packed files:', f.length);
})"
#   `MISS cordis.patch.yml` 就是真实发生过的事故：清单里 dsh.bundle.patch 指着它，
#   文件却没进包 → 安装"成功"，但 `dsh web` 启动即 ENOENT:
#   "failed to read overlay ... cordis.patch.yml"
#   `npm run check` 里的 packaging 门禁会同时报错（validate-skills.mjs）。
```

然后用**一次性的 headless profile** 验证，不碰你自己的 `web` profile，也不起 web 服务：

```bash
# 5a. 建临时 profile（从 headless 模板初始化；--dump-config 只组合配置不启动服务）
dsh --profile arscheck --from-default-profile headless --dump-config | head -5

# 5b. 从 GitHub 安装（这一步才真正检验别人拿到仓库能不能装上）
dsh plugin --profile arscheck add github:Luan-Qi/academic-research-skills-dsh

# 5b'. 装完先确认包体完整（比启动更快发现问题）
test -f ~/.dsh/profiles/arscheck/node_modules/academic-research-skills-dsh/cordis.patch.yml \
  && echo "patch present" || echo "PATCH MISSING — files whitelist is broken"

# 5c. 确认 bundle patch 进了配置树
dsh --profile arscheck --dump-config | grep -A3 'academic-research-skills-dsh'
#   期望：
#   # == academic-research-skills-dsh
#   - id: ars-skills
#     name: academic-research-skills-dsh/startup
#     inject:
#       - skills

# 5d. 真实启动一次，确认 provider 注册无异常
dsh --profile arscheck "reply with exactly: OK"
#   期望日志：[academic-research-skills-dsh] skill provider registered from ...
#   期望结果：OK（exit 0）

# 5e. 清理
dsh plugin --profile arscheck remove academic-research-skills-dsh
rm -rf ~/.dsh/profiles/arscheck        # Windows: Remove-Item -Recurse -Force
```

5b 失败时常见原因：

| 现象 | 原因 / 处理 |
|---|---|
| `pnpm not found on PATH` | 先装 pnpm。 |
| pnpm 提示 build scripts 被拦 | 本包**没有** `prepare`/`postinstall`，不应出现；若出现，说明仓库里混入了生命周期脚本，查 `package.json`。 |
| 装上了但配置树里没有 `ars-skills` 行 | `package.json` 的 `dsh.bundle.patch` 丢了或路径写错。 |
| 启动报 `ctx.skills.registerProvider unavailable` | profile 缺 `skills` 服务（`dsh-base` 应提供）；检查 `cordis.patch.yml` 的 `inject: [skills]`。 |

## 6. 可选：用户技能（`~/.dsh/skills`）路径的验证

只有当你打算让别人也用方式 B 时才需要：

```bash
node build/install-user-skills.mjs          # 复制 + 改写引用 + 自查
node build/verify-user-skills.mjs           # 确认 DSH 能发现它们
```

预期：`install` 自查 `0 条无法解释`；`verify` 报告 **6 个目录 bundle + 39 个平铺文件**可发现
（第 6 个是你自己的技能，如果 `~/.dsh/skills` 里还有别的）。被跳过的条目（资源目录、
无 frontmatter 的说明文件）会各打一条无害警告。

## 7. 版本与变更记录

- **跟踪的上游版本**变了（例如上游发 v3.24.0）：先跑 §9 的重新同步流程，再更新
  `README.md` 顶部徽章、`package.json` 的 `description`、`PORTING-NOTES.md` §1 表。
- **本移植自身**的改动：升级 `package.json` 的 `version`，在 `PORTING-NOTES.md` §2 增加一条
  `P<n>`（写清"上游事实 → 问题 → 修法 → 验证证据"），并跑 §1 的全部门禁。
- 打标签发布：`git tag -a v1.0.0 -m "..." && git push origin v1.0.0`。

## 8. 许可证义务（不可省）

- `LICENSE`（上游 CC-BY-NC-4.0 原文）必须随仓库分发 —— 已在。
- `NOTICE.md` 必须有**署名 + 修改声明 + 不背书声明** —— 已在。
- `PORTING-NOTES.md` 就是许可证要求的 Statement of Changes —— 每次改动都要同步更新。
- **禁止商业用途**。若有人要商用，需要另行取得授权（上游条款如此）。
- 礼貌但非必需：告知上游（`Imbad0202/academic-research-skills`）你的社区移植，
  上游 `CONTRIBUTING.md` 有 "Platform ports (community-maintained only)" 政策，
  `THIRD_PARTY.md` 专门收录社区移植。

## 9. 重新同步上游（上游发新版时）

```bash
# 1) 用上游/新版本覆盖方法论层：五个技能目录 + shared/ + scripts/ + docs/ + examples/ + audits/
#    + evals/heldout/review_criteria_constructive_value/
# 2) 重放移植层（顺序不可换）
node build/normalize-host.mjs        # 宿主 token 级替换（幂等；重复运行改动数应为 0）
node build/normalize-eol.mjs --write # 收敛到 LF
node build/port-edits.mjs            # 整段改写（一次性锚点；已在场会报 already applied）
node build/generate-commands.mjs     # 重新生成 39 个命令
node build/generate-repo-docs.mjs    # 重新同步 agents/ 镜像
node build/refresh-content-locks.mjs # 先看报告，确认每一处字节差异都是有意为之，再 --write
npm run check && npm run check:upstream
```

**若 `port-edits.mjs` 报锚点找不到**：说明上游把那几段文字挪动了。到 `build/port-edits.mjs`
里按 `id` 找到对应条目，按新文本更新 `find`，**不要**用模糊匹配绕过去——每个锚点必须恰好命中一次，
这是故意设计的"上游文本位移会被立刻发现"机制。

---

## 附：本仓库刻意保留的"不干净"之处

发布前有人会疑惑这些，说明如下，都**不要**顺手"修好"：

| 现象 | 为什么保留 |
|---|---|
| `npm run check:upstream` 里有 15 条不适用 + 52 条未分类 | 那 15 条需要 Claude Code 打包 / `.github/workflows` / `hooks/` / 上游完整仓库；其中 2 条**要求写入 DSH 不能有的 `${CLAUDE_PLUGIN_ROOT}` 与 `$ARGUMENTS`**，任何宿主正确的移植都不可能通过。分类与理由在 `build/run-upstream-lints.mjs`。 |
| `scripts/_calibration_pdf_text.py` 含 1 个 U+FFFD | **上游同样如此**（字节一致），未改动以免掩盖问题；`check-encoding.mjs` 里有具名 allowlist。 |
| `docs/`、`CHANGELOG.md` 提到 `hooks/`、`pi/`、`.github/` 等不存在的路径 | 它们是上游溯源文件，保持逐字节不变；模型运行时不会加载它们。 |
| `audit-refs.mjs` 报告 34 条"预期不存在" | 运行期产物路径（`phase1/…`、`audit_artifacts/…`）、上游 CI、插件自身文件、第三方项目引用、示例路径。每条都带理由。 |
| `PORTING-NOTES.md` 里有大段"上一版移植"的问题清单 | 那是本次移植的存在理由与证据链，不是待办。 |
