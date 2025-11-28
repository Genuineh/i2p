/**
 * Host 脚本 - 运行在 Pixso 主线程环境
 * 利用 hostApi 扩展功能，访问更多 Pixso 原生能力
 *
 * 主要功能：
 * 1. 生命周期管理：onMounted、onBeforeUnmount
 * 2. Sandbox 通信：与 main.ts (sandbox) 进行双向消息通信
 * 3. 插件坞功能：showPluginDockAsync
 *
 * For more information about the hostApi, please go to the https://pixso.cn/developer/zh/
 */

/**
 * 消息类型定义
 */
interface HostMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  timestamp?: number;
}

/**
 * 消息处理器类型
 */
type MessageHandler = (message: HostMessage) => void;

/**
 * Host 脚本管理器
 * 封装 hostApi 功能，提供更便捷的接口
 */
class HostScriptManager {
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private isInitialized: boolean = false;
  private sandboxMessageHandler: ((message: HostMessage) => void) | null = null;

  /**
   * 初始化 Host 脚本管理器
   */
  init(): void {
    if (this.isInitialized) {
      console.warn("HostScriptManager 已经初始化");
      return;
    }

    // 设置 Sandbox 消息监听
    this.setupSandboxListener();
    this.isInitialized = true;
    console.log("HostScriptManager 初始化完成");
  }

  /**
   * 设置 Sandbox 消息监听器
   */
  private setupSandboxListener(): void {
    // 保存监听器引用以便后续清理
    this.sandboxMessageHandler = (message: HostMessage) => {
      console.log("Host 收到 Sandbox 消息:", message);
      this.handleMessage(message);
    };
    hostApi.sandbox.on("message", this.sandboxMessageHandler);
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(message: HostMessage): void {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers && handlers.length > 0) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error(`消息处理器执行错误 (type: ${message.type}):`, error);
        }
      });
    } else {
      // 默认处理
      this.defaultMessageHandler(message);
    }
  }

  /**
   * 默认消息处理器
   */
  private defaultMessageHandler(message: HostMessage): void {
    switch (message.type) {
      case "ping":
        // 响应心跳检测
        this.sendToSandbox({ type: "pong", timestamp: Date.now() });
        break;
      case "show-dock":
        // 显示插件坞
        this.showPluginDock();
        break;
      case "host-status":
        // 返回 Host 状态
        this.sendToSandbox({
          type: "host-status-response",
          data: { initialized: this.isInitialized, timestamp: Date.now() },
        });
        break;
      default:
        console.log("未处理的消息类型:", message.type);
    }
  }

  /**
   * 注册消息处理器
   */
  registerHandler(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);
  }

  /**
   * 移除消息处理器
   */
  removeHandler(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 发送消息到 Sandbox
   */
  sendToSandbox(message: HostMessage): void {
    try {
      hostApi.sandbox.postMessage(message);
      console.log("Host 发送消息到 Sandbox:", message);
    } catch (error) {
      console.error("发送消息到 Sandbox 失败:", error);
    }
  }

  /**
   * 显示插件坞
   */
  async showPluginDock(): Promise<void> {
    try {
      await hostApi.showPluginDockAsync();
      console.log("插件坞已显示");
    } catch (error) {
      console.error("显示插件坞失败:", error);
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 移除 Sandbox 消息监听器
    if (this.sandboxMessageHandler) {
      hostApi.sandbox.off("message", this.sandboxMessageHandler);
      this.sandboxMessageHandler = null;
    }
    this.messageHandlers.clear();
    this.isInitialized = false;
    console.log("HostScriptManager 资源已清理");
  }
}

// 创建全局 Host 脚本管理器实例
const hostManager = new HostScriptManager();

/**
 * Host 脚本挂载完成回调
 * 在这里执行初始化操作
 */
hostApi.onMounted(() => {
  console.log("=== Host Script Mounted ===");
  console.log("Host 脚本已加载，运行在 Pixso 主线程环境");

  // 初始化 Host 脚本管理器
  hostManager.init();

  // 注册自定义消息处理器示例
  hostManager.registerHandler("custom-action", (message: HostMessage) => {
    console.log("执行自定义操作:", message.data);
    // 处理自定义操作并返回结果
    hostManager.sendToSandbox({
      type: "custom-action-result",
      data: { success: true, originalData: message.data },
      timestamp: Date.now(),
    });
  });

  // 通知 Sandbox Host 已就绪
  hostManager.sendToSandbox({
    type: "host-ready",
    data: { version: "1.0.0" },
    timestamp: Date.now(),
  });
});

/**
 * Host 脚本卸载前回调
 * 在这里执行清理操作，防止影响 Pixso 正常功能
 */
hostApi.onBeforeUnmount(() => {
  console.log("=== Host Script Unmounting ===");
  console.log("Host 脚本即将卸载，执行清理操作");

  // 通知 Sandbox Host 即将卸载
  hostManager.sendToSandbox({
    type: "host-unmounting",
    timestamp: Date.now(),
  });

  // 清理资源
  hostManager.cleanup();

  console.log("Host 脚本清理完成");
});
