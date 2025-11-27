# Changelog

本文档记录项目的所有重要更改。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- 使用 Pixso 官方插件模板初始化 React + TypeScript 项目
- 创建项目文档结构 (README.md, TODO.md, CHANGELOG.md, CONTRIBUTING.md)
- 规划"上传截图生成设计内容"功能的实现计划
- **阶段二：图片处理核心功能**
  - 实现图片识别服务模块化架构 (`src/services/`)
  - 实现本地图像处理服务 (`LocalImageProcessor`) - 使用 Canvas API 进行颜色和区域分析
  - 实现 OpenAPI 图片识别服务 (`OpenApiVisionService`) - 支持 OpenAI Vision API 等兼容服务
  - 实现图片识别管理器 (`ImageRecognitionManager`) - 统一管理和调度识别服务，支持服务降级
  - 实现图片压缩工具函数 (`src/utils/imageUtils.ts`)
  - 集成图片识别到主线程 (`main.ts`)
  - 实现基础 Pixso 元素生成 (矩形、圆形、文本、线条、框架)
  - 实现 UI 与主线程的消息通信机制 (处理进度、完成、错误状态反馈)

### 计划中
- 图片元素完整支持
- 渐变和阴影效果支持
- 布局结构分析和还原
- Host 脚本扩展功能

## [1.0.0] - 待发布

### 预期功能
- 支持上传 PNG/JPG/JPEG/WebP 格式图片
- 自动识别图片内容
- 生成对应的 Pixso 设计元素
- 支持基本形状、文本、图片等元素类型
- 提供友好的用户界面
