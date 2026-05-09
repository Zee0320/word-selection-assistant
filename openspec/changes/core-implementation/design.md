## Context

全新 Electron 桌面应用项目，目标是 Windows x64 平台上的全局划词助手。用户在任意应用中鼠标划词选中文本后，程序在光标附近弹出悬浮工具栏，提供翻译和 AI 对话两大功能。程序常驻系统托盘运行。

当前项目为空白状态，无历史代码约束。

## Goals / Non-Goals

**Goals:**

- 实现跨应用的全局文本选择捕获
- 提供低延迟的单词/短语词典查询（离线+在线双通道）
- 提供流式 AI 翻译和对话能力
- 提供直观的悬浮交互界面和设置管理
- 常驻系统托盘，随时可用

**Non-Goals:**

- 不支持 macOS / Linux（首版仅 Windows x64）
- 不支持 OCR 图片取词
- 不做翻译历史持久化
- 不做多语言翻译（首版仅中英互译）
- 不做全局快捷键触发（仅鼠标划词）

## Decisions

### D1: 应用框架选用 Electron

**选择**: Electron 28+
**替代方案**: Tauri v2, Python + PyQt
**理由**:
- Electron 的 HTML/CSS/JS 渲染能力最强，适合构建丰富的翻译面板和聊天 UI
- `uiohook-napi` 在 Electron 生态中有成熟的集成方案
- Node.js 侧处理 SSE 流式响应非常自然
- 团队（用户）对 Web 技术更熟悉
- 缺点：打包体积较大（~150MB 基础），但桌面工具场景可接受

### D2: 全局文本捕获采用剪贴板模拟方案

**选择**: uiohook-napi 监听全局 mouseup → 延迟 50ms → 备份剪贴板 → 模拟 Ctrl+C → 读取剪贴板 → 还原剪贴板
**替代方案**: Windows UI Automation API, 直接 Hook 各应用文本选择事件
**理由**:
- 剪贴板模拟是业界验证过的方案（有道词典、QTranslate 等均采用）
- 兼容性最好，几乎所有支持 Ctrl+C 的应用都能工作
- UI Automation API 覆盖面有限，很多应用不暴露 accessible text
- 需要特别处理：空选判断（模拟 Ctrl+C 前后剪贴板内容不变则为空选）、自身窗口排除

### D3: 单词词典采用 Free Dictionary API + ECDICT 双源

**选择**: 在线查 Free Dictionary API（英文释义、音标、例句），同时离线查 ECDICT SQLite（中文释义）
**替代方案**: 仅用 AI 生成词典式回答，仅用单一词典源
**理由**:
- Free Dictionary API 免费无 Key，返回结构化数据（音标、词性、释义、例句）
- ECDICT 离线词库提供中文释义，无网络延迟
- 双源组合可以在 API 不可用时降级到纯离线模式
- 纯 AI 方案延迟高（1-3 秒），且消耗用户 API 额度

### D4: AI 通信统一使用 OpenAI 兼容协议

**选择**: `POST /v1/chat/completions`，支持 `stream: true`
**替代方案**: 自定义协议，多 SDK 适配
**理由**:
- 用户自建后端已兼容 OpenAI 调用方式
- 一套协议覆盖翻译和对话两个功能
- 流式输出通过 SSE 解析 `data: {...}` 格式
- 前端使用 `fetch` + `ReadableStream` 处理流

### D5: 悬浮窗使用独立 BrowserWindow

**选择**: 每次划词创建/复用一个 frameless、transparent、alwaysOnTop 的 BrowserWindow
**替代方案**: 使用 overlay 库或系统原生窗口
**理由**:
- Electron BrowserWindow 原生支持 frameless + transparent
- 可精确控制位置（跟随鼠标坐标）
- 通过 IPC 与主进程通信，架构清晰
- 点击外部关闭通过监听 `blur` 事件实现

### D6: 设置存储使用 electron-store

**选择**: `electron-store`（基于 JSON 文件的 key-value 存储）
**替代方案**: SQLite, localStorage, 自定义配置文件
**理由**:
- 设置项少（API 地址、Key、模型名、功能开关、短语阈值），JSON 足够
- electron-store 提供类型安全、默认值、加密（可选加密 API Key）
- 无需额外依赖

### D7: 项目结构

```
word-selection-assistant/
├── package.json
├── electron-builder.yml          # 打包配置
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.js              # 应用入口
│   │   ├── tray.js               # 系统托盘管理
│   │   ├── text-capture.js       # 全局文本捕获
│   │   ├── floating-window.js    # 悬浮窗管理
│   │   ├── settings-window.js    # 设置窗口管理
│   │   ├── ai-client.js          # OpenAI 兼容 API 客户端
│   │   ├── dictionary.js         # 词典查询（Free Dict API + ECDICT）
│   │   └── store.js              # 设置存储
│   ├── renderer/                 # 渲染进程
│   │   ├── floating/             # 悬浮工具栏 + 翻译/对话面板
│   │   │   ├── index.html
│   │   │   ├── style.css
│   │   │   └── script.js
│   │   └── settings/             # 设置页面
│   │       ├── index.html
│   │       ├── style.css
│   │       └── script.js
│   └── preload/                  # Preload 脚本（安全桥接）
│       ├── floating-preload.js
│       └── settings-preload.js
├── assets/
│   ├── icon.png                  # 托盘图标
│   └── ecdict.db                 # ECDICT SQLite 词库
└── data/
    └── ecdict/                   # ECDICT 词库构建/下载脚本
```

### D8: IPC 通信架构

```
Renderer (floating)          Main Process              External
─────────────────           ────────────              ────────
                            
translate-word ──────────▶  dictionary.js ──────────▶ Free Dict API
                            + ECDICT SQLite           dictionaryapi.dev
                            
translate-sentence ──────▶  ai-client.js ────────────▶ OpenAI 兼容 API
(stream response)           (SSE parsing)              用户自建后端
                            
ai-chat-send ────────────▶  ai-client.js ────────────▶ OpenAI 兼容 API
(stream response)           (SSE parsing)              用户自建后端
                            
get-settings ────────────▶  store.js
save-settings ───────────▶  store.js
toggle-feature ──────────▶  store.js ──▶ notify renderer
                            
mouseup (global) ──────────▶ text-capture.js
                             ├── clipboard backup
                             ├── simulate Ctrl+C
                             ├── read clipboard
                             ├── restore clipboard
                             └──▶ floating-window.js
                                  └──▶ show window at cursor
```

## Risks / Trade-offs

**[R1] 剪贴板模拟可能干扰用户操作**
→ 缓解：模拟前备份剪贴板，完成后立即还原。整个过程控制在 100ms 以内。

**[R2] 某些应用中 Ctrl+C 有特殊含义（如终端中断进程）**
→ 缓解：首版不做黑名单，但架构预留黑名单机制（通过进程名/窗口标题过滤）。

**[R3] 管理员权限应用中可能无法捕获事件**
→ 缓解：已知限制，文档说明。可通过以管理员身份运行程序来解决。

**[R4] Free Dictionary API 不可用时降级**
→ 缓解：优先使用 ECDICT 离线数据作为 fallback，仅英文释义/例句部分缺失。

**[R5] uiohook-napi 在某些 Electron 版本中的兼容性**
→ 缓解：锁定 Electron 28.x 和已验证的 uiohook-napi 版本。

**[R6] ECDICT 词库文件体积增加打包大小**
→ 权衡：~30MB 数据换取离线词典能力和零延迟中文释义，值得。
