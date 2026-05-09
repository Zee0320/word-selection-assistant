## Why

在日常工作和学习中，用户经常需要在不同应用程序（浏览器、PDF 阅读器、IDE、文档编辑器等）中阅读英文内容，遇到不认识的单词或需要翻译的句子时，需要频繁切换到翻译工具。这种上下文切换极大地打断了阅读和思考的流畅性。需要一个常驻系统托盘的全局划词助手，在任何应用中选中文本后即刻提供翻译和 AI 对话能力。

## What Changes

这是一个全新项目，从零构建以下能力：

- **全局文本捕获**：通过系统级鼠标 Hook 监听 mouseup 事件，模拟 Ctrl+C 获取跨应用选中文本
- **悬浮工具栏**：在鼠标位置附近弹出 frameless 透明悬浮窗，提供翻译和 AI 对话入口
- **划词翻译**：
  - 单词/短语（≤3 词）：调用 Free Dictionary API + ECDICT 离线词库，展示音标、词性、释义、例句
  - 句子（>3 词）：调用用户预设的 OpenAI 兼容 API 进行中英互译，支持流式输出
- **AI 对话**：以划词内容作为上下文，展开聊天面板，用户可追问交互，调用预设 AI API，支持流式输出
- **功能开关**：翻译和 AI 对话功能可独立启用/禁用，禁用后悬浮栏中对应按钮不显示
- **设置界面**：独立设置窗口，配置 API 地址、Key、模型名称、功能开关等
- **系统托盘**：常驻托盘运行，右键菜单提供设置、暂停/恢复、退出功能

## Capabilities

### New Capabilities

- `text-capture`: 全局鼠标 Hook 监听、剪贴板模拟获取选中文本、空选过滤、自身窗口排除
- `floating-toolbar`: frameless 透明悬浮窗管理，定位、显示/隐藏、点击外部关闭
- `translation`: 单词/短语词典查询（Free Dictionary API + ECDICT）与句子 AI 翻译（流式），中英互译
- `ai-chat`: 基于划词上下文的 AI 对话，聊天面板 UI，流式消息渲染
- `settings`: 设置窗口 UI，API 配置持久化，功能开关管理
- `system-tray`: 系统托盘图标，右键菜单（设置/暂停/恢复/退出），应用生命周期管理

### Modified Capabilities

_无（全新项目）_

## Impact

- **技术栈**：Electron (Node.js + Chromium)，目标平台 Windows x64
- **系统级依赖**：`uiohook-napi`（全局输入 Hook）、`@nut-tree/nut-js` 或 `robotjs`（模拟按键）、`better-sqlite3`（ECDICT 离线词库）
- **外部 API 依赖**：Free Dictionary API (dictionaryapi.dev, 免费无需 Key)、用户自建的 OpenAI 兼容 API
- **数据文件**：ECDICT SQLite 词库文件（约 30MB），随应用打包分发
- **打包体积**：预估 ~180MB（Electron 基础 + 词库数据）
