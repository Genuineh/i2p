# I2P - Image to Pixso Plugin

一个 Pixso 插件，可以将截图上传并生成 Pixso 设计内容。

## 项目简介

本项目是基于 Pixso 官方插件模板创建的 React + TypeScript 项目，旨在实现将截图图片上传到 Pixso 并自动生成对应的设计内容。

## 技术栈

- **框架**: React 16
- **语言**: TypeScript
- **构建工具**: @pixso/plugin-cli
- **运行环境**: Pixso 插件环境

## 项目结构

```
i2p/
├── host.ts          # 宿主脚本 (运行在 Pixso 宿主环境)
├── main.ts          # 主入口 (sandbox 环境)
├── manifest.json    # 插件配置文件
├── package.json     # 项目依赖配置
├── tsconfig.json    # TypeScript 配置
├── ui/              # UI 界面
│   ├── App.tsx      # React 主组件
│   ├── app.css      # 样式文件
│   ├── index.tsx    # React 入口
│   └── ui.html      # HTML 模板
├── dist/            # 构建输出目录
├── README.md        # 项目说明
├── TODO.md          # 任务规划
├── CHANGELOG.md     # 更新日志
└── CONTRIBUTING.md  # 贡献指南
```

## 快速开始

### 环境要求

- Node.js >= 14
- npm >= 6

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

启动开发服务器，支持热更新。

### 构建生产版本

```bash
npm run build
```

构建输出到 `dist/` 目录。

### 打包插件

```bash
npm run pkg
```

将插件打包为可上传的格式。

## 使用方法

1. 在 Pixso 中安装本插件
2. 打开 Pixso 设计文件
3. 运行插件
4. 上传截图图片
5. 插件将自动分析图片并生成对应的设计元素

## API 参考

### Pixso Plugin API

- `pixso.showUI(__html__)` - 显示插件 UI 界面
- `pixso.ui.onmessage` - 接收 UI 发送的消息
- `pixso.createRectangle()` - 创建矩形元素
- `pixso.currentPage` - 当前页面对象
- `pixso.viewport` - 视口控制

### Host API

- `hostApi.onMounted()` - 宿主脚本挂载完成回调

## 开发文档

更多开发信息请参考:

- [Pixso 开发者文档](https://pixso.cn/developer/zh/)
- [Pixso Plugin API](https://pixso.cn/developer/zh/api/)
- [官方工具集](https://pixso.cn/developer/zh/tools.html)

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件
