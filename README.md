# AI Helper Chrome Extension

AI Helper 是一个强大的 Chrome 浏览器扩展，它提供了一个便捷的 AI 聊天助手界面，支持多个 AI 模型，包括 DeepSeek、阿里云、腾讯云、Google Gemini 等。

## 主要特性

- 🎨 支持亮色/暗色主题切换
- 🤖 支持多个 AI 模型
  - DeepSeek R1 & V3
  - 阿里云 R1
  - 腾讯云 R1
  - 硅基流动 R1
  - Google Gemini 2 Flash
- 💬 流式响应，实时显示 AI 回复
- 🔑 安全的 API Key 管理
- 📱 响应式设计，完美适配不同屏幕尺寸
- 💾 自动保存聊天历史
- 🧹 一键清除聊天记录

## 快速开始

### 环境要求

- Node.js 16+
- pnpm 8+
- Chrome 浏览器

### 安装和启动

1. 安装 pnpm（如果未安装）
```bash
npm install -g pnpm
```

2. 安装项目依赖
```bash
pnpm install
```

3. 启动开发服务器
```bash
pnpm dev
```

4. 构建扩展
```bash
pnpm build
```

5. 在 Chrome 中加载扩展
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目的 `dist` 目录

### 常用命令

```bash
# 开发
pnpm dev               # 启动开发服务器
pnpm type-check        # 类型检查
pnpm lint             # 代码检查
pnpm lint:fix         # 自动修复代码问题

# 构建
pnpm build            # 构建生产版本
pnpm zip              # 打包 zip 文件

# 清理
pnpm clean            # 清理所有构建文件和依赖
pnpm clean:bundle     # 只清理构建文件
```

## 使用说明

1. 点击 Chrome 工具栏中的扩展图标打开 AI Helper
2. 在设置中选择想要使用的 AI 模型
3. 输入对应模型的 API Key
4. 开始对话！

## 技术栈

- React
- TypeScript
- TailwindCSS
- Chrome Extensions API
- Vite

## 注意事项

- 请确保妥善保管您的 API Keys
- 不同 AI 模型可能有不同的定价策略
- 建议在开发模式下进行测试

## 贡献指南

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 联系方式

如有任何问题或建议，欢迎提出 Issue 或 Pull Request。

---

Made with ❤️ by [Your Name]