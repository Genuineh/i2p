# TODO - 任务规划

本文档记录项目的开发任务和实现计划。

## 核心功能: 在 Pixso 上上传截图，生成 Pixso 设计内容

### 任务概述

实现一个 Pixso 插件，允许用户上传截图图片，并自动识别图片内容生成对应的 Pixso 设计元素。

### 实现计划

#### 阶段一：基础 UI 开发 (优先级：高)

- [x] **UI 界面改造**
  - [x] 设计图片上传界面
  - [x] 添加文件选择/拖拽上传组件
  - [x] 添加图片预览功能
  - [x] 显示上传进度和状态

- [x] **样式优化**
  - [x] 优化现有 CSS 样式
  - [x] 添加响应式布局支持
  - [x] 添加加载动画和错误提示样式

#### 阶段二：图片处理核心功能 (优先级：高)

- [ ] **图片上传处理**
  - [ ] 实现图片文件读取 (FileReader API)
  - [ ] 支持的图片格式: PNG, JPG, JPEG, WebP
  - [ ] 图片大小限制和验证
  - [ ] 图片压缩处理 (可选)

- [ ] **图片分析与识别**
  - [ ] 研究和选择合适的图片识别方案
  - [ ] 方案 A: 使用 AI/ML 服务 (如 OpenAI Vision API)
  - [ ] 方案 B: 使用本地图像处理库进行简单识别
  - [ ] 方案 C: 集成第三方设计识别服务
  - [ ] 确定最终方案并实现

#### 阶段三：Pixso 元素生成 (优先级：高)

- [ ] **基础元素创建**
  - [ ] 根据识别结果创建基本形状 (矩形、圆形、线条)
  - [ ] 设置元素位置、大小、颜色
  - [ ] 处理元素层级关系

- [ ] **高级元素处理**
  - [ ] 处理文本元素 (pixso.createText)
  - [ ] 处理图片元素 (pixso.createImage)
  - [ ] 处理组合/框架 (pixso.createFrame)
  - [ ] 处理渐变和阴影效果

- [ ] **布局还原**
  - [ ] 分析截图中的布局结构
  - [ ] 自动生成响应式约束
  - [ ] 保持元素间距和对齐

#### 阶段四：UI 与主线程通信 (优先级：中)

- [ ] **消息通信机制**
  - [ ] 定义消息类型和格式
  - [ ] 实现 UI -> 主线程的图片数据传输
  - [ ] 实现主线程 -> UI 的进度和状态反馈
  - [ ] 错误处理和重试机制

- [ ] **Host 脚本功能**
  - [ ] 利用 hostApi 扩展功能
  - [ ] 访问更多 Pixso 原生能力

#### 阶段五：用户体验优化 (优先级：中)

- [ ] **交互优化**
  - [ ] 添加操作引导
  - [ ] 添加快捷键支持
  - [ ] 优化处理速度

- [ ] **错误处理**
  - [ ] 完善错误提示信息
  - [ ] 添加日志记录
  - [ ] 异常恢复机制

#### 阶段六：测试与发布 (优先级：高)

- [ ] **测试**
  - [ ] 单元测试
  - [ ] 集成测试
  - [ ] 用户场景测试

- [ ] **文档完善**
  - [ ] 更新 README
  - [ ] 编写使用指南
  - [ ] 记录 API 变更

- [ ] **发布准备**
  - [ ] 版本号管理
  - [ ] 打包和发布
  - [ ] 用户反馈收集

### 技术方案详细说明

#### 图片上传实现方案

```typescript
// UI 组件中的图片上传处理
const handleFileUpload = (file: File) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const imageData = e.target?.result;
    // 发送图片数据到主线程
    parent.postMessage({
      pluginMessage: {
        type: 'upload-image',
        data: imageData
      }
    }, '*');
  };
  reader.readAsDataURL(file);
};
```

#### 主线程处理方案

```typescript
// main.ts 中的图片处理
pixso.ui.onmessage = async (msg) => {
  if (msg.type === 'upload-image') {
    // 1. 接收图片数据
    const imageData = msg.data;
    
    // 2. 分析图片内容 (需要集成识别服务)
    const analysisResult = await analyzeImage(imageData);
    
    // 3. 根据分析结果生成设计元素
    await generateDesignElements(analysisResult);
    
    // 4. 通知 UI 处理完成
    pixso.ui.postMessage({ type: 'complete' });
  }
};
```

### 风险与挑战

1. **图片识别准确性**: 需要选择合适的识别方案，平衡准确性和性能
2. **大图片处理**: 需要考虑内存和性能限制
3. **复杂布局还原**: 复杂的设计可能难以完美还原
4. **跨域限制**: Pixso 插件环境的沙盒限制

### 里程碑

| 里程碑 | 目标 | 预计时间 |
|--------|------|----------|
| M1 | 完成基础 UI 和图片上传 | 1 周 |
| M2 | 完成图片识别集成 | 2 周 |
| M3 | 完成基础元素生成 | 1 周 |
| M4 | 完成完整功能和测试 | 1 周 |

## 其他待办事项

### 项目配置

- [x] 配置 ESLint 和 Prettier
- [ ] 配置 Git Hooks (husky)
- [x] 设置 CI/CD 流程

### 文档

- [x] 创建 README.md
- [x] 创建 TODO.md
- [x] 创建 CHANGELOG.md
- [x] 创建 CONTRIBUTING.md

### 代码质量

- [ ] 添加 TypeScript 严格模式
- [ ] 添加单元测试框架
- [ ] 添加代码覆盖率检查
