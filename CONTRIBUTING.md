# 贡献指南

感谢你对本项目的关注！欢迎提交问题反馈和代码贡献。

## 如何贡献

### 报告问题

1. 确认问题尚未被报告过
2. 使用 GitHub Issues 提交问题
3. 提供详细的复现步骤
4. 附上相关的截图或日志

### 提交代码

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

## 开发规范

### 代码风格

- 使用 TypeScript 编写代码
- 遵循 ESLint 配置规范
- 使用 Prettier 格式化代码
- 组件使用函数式组件和 Hooks

### 提交信息规范

使用约定式提交规范：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具相关

示例：
```
feat: 添加图片上传功能
fix: 修复图片预览显示问题
docs: 更新 README 安装说明
```

### 分支命名

- `main` - 主分支，保持稳定
- `feature/*` - 新功能开发
- `fix/*` - Bug 修复
- `docs/*` - 文档更新

## 本地开发

### 环境设置

```bash
# 克隆仓库
git clone https://github.com/Genuineh/i2p.git

# 进入目录
cd i2p

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 运行测试

```bash
npm test
```

### 构建项目

```bash
npm run build
```

## 项目结构

```
i2p/
├── host.ts          # 宿主脚本
├── main.ts          # 主入口
├── manifest.json    # 插件配置
├── ui/              # UI 界面
│   ├── App.tsx      # React 主组件
│   ├── index.tsx    # React 入口
│   └── ui.html      # HTML 模板
└── dist/            # 构建输出
```

## 获取帮助

如果你有任何问题，可以：

1. 查看 [README.md](README.md)
2. 查看 [Pixso 开发文档](https://pixso.cn/developer/zh/)
3. 在 Issues 中提问

## 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下发布。
