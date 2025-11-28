import {
  ImageRecognitionManager,
  ImageAnalysisResult,
  RecognizedElement,
  ImageRecognitionConfig,
  ColorInfo,
  GradientInfo,
  ElementEffect,
  ShadowEffect,
  BlurEffect,
  LayoutConstraints,
  ConstraintType,
} from "./src/services";
import { logger, LogLevel } from "./src/utils";

// 配置日志记录器
logger.configure({
  minLevel: LogLevel.DEBUG,
  maxEntries: 500,
  enableConsole: true,
});

/**
 * Host 消息类型定义
 */
interface HostMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  timestamp?: number;
}

/**
 * 错误类型枚举
 */
enum ProcessErrorType {
  IMAGE_ANALYSIS = "IMAGE_ANALYSIS",
  ELEMENT_CREATION = "ELEMENT_CREATION",
  FONT_LOADING = "FONT_LOADING",
  TIMEOUT = "TIMEOUT",
  CANVAS_ERROR = "CANVAS_ERROR",
  UNKNOWN = "UNKNOWN",
}

/**
 * 获取错误建议
 */
function getErrorSuggestion(errorType: ProcessErrorType, errorMessage: string): string {
  switch (errorType) {
    case ProcessErrorType.IMAGE_ANALYSIS:
      return "请尝试使用更清晰的图片，或调整图片大小后重新上传";
    case ProcessErrorType.ELEMENT_CREATION:
      return "设计元素创建失败，请尝试使用其他图片";
    case ProcessErrorType.FONT_LOADING:
      return "字体加载失败，部分文本可能无法正确显示";
    case ProcessErrorType.TIMEOUT:
      return "处理超时，请在设置中切换为 OpenAPI 模式处理图片";
    case ProcessErrorType.CANVAS_ERROR:
      return "沙箱环境不支持本地图片处理，请在设置中切换为 OpenAPI 模式";
    default:
      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        return "网络连接失败，请检查网络后重试";
      }
      if (errorMessage.includes("超时") || errorMessage.includes("timeout")) {
        return "处理超时，请在设置中切换为 OpenAPI 模式处理图片";
      }
      if (
        errorMessage.includes("Canvas") ||
        errorMessage.includes("canvas") ||
        errorMessage.includes("沙箱") ||
        errorMessage.includes("sandbox") ||
        errorMessage.includes("OpenAPI 模式")
      ) {
        return "沙箱环境不支持本地图片处理，请在设置中切换为 OpenAPI 模式";
      }
      return "请刷新插件后重试，如问题持续请联系支持";
  }
}

/**
 * Host 通信管理器
 * 处理与 Host 脚本的双向通信
 *
 * 通信架构说明：
 * - Host -> Sandbox: hostApi.sandbox.postMessage(message)
 * - Sandbox -> Host: 通过 UI 层转发，或等待 Host 主动轮询
 *
 * 由于 Pixso sandbox 环境限制，sandbox 不能直接发送消息到 host，
 * 而是通过以下方式实现间接通信：
 * 1. Host 主动发送心跳/状态查询
 * 2. Sandbox 在收到 Host 消息时响应
 * 3. 通过 UI 层转发消息
 */
class HostCommunicationManager {
  private hostReady: boolean = false;
  private pendingMessages: HostMessage[] = [];
  private messageCallbacks: Map<string, ((response: HostMessage) => void)[]> = new Map();
  private static readonly MAX_PENDING_MESSAGES = 100;

  /**
   * 初始化 Host 通信
   */
  init(): void {
    // 监听来自 Host 的消息（通过 UI 转发）
    pixso.on("run", () => {
      logger.info("HostCommunication", "Sandbox 运行中，等待 Host 就绪");
    });

    // Host 会在 mounted 时发送 host-ready 消息
    // sandbox 通过 UI 接收这些消息
    logger.info("HostCommunication", "HostCommunicationManager 已初始化，等待 Host 消息");
  }

  /**
   * 处理来自 Host 的消息
   * 这些消息通过 hostApi.sandbox.postMessage 发送，并由 pixso.ui.onmessage 接收
   */
  handleHostMessage(message: HostMessage): void {
    logger.debug("HostCommunication", "Sandbox 收到 Host 消息", { type: message.type });

    switch (message.type) {
      case "host-ready":
        this.hostReady = true;
        logger.info("HostCommunication", "Host 已就绪", { version: message.data?.version });
        // 通知 UI Host 已就绪
        pixso.ui.postMessage({
          type: "host-ready",
          data: message.data,
        });
        // 发送待处理的消息
        this.flushPendingMessages();
        break;

      case "pong":
        this.hostReady = true;
        logger.debug("HostCommunication", "Host 心跳响应正常");
        break;

      case "host-unmounting":
        this.hostReady = false;
        logger.info("HostCommunication", "Host 即将卸载");
        // 通知 UI Host 即将卸载
        pixso.ui.postMessage({
          type: "host-unmounting",
        });
        break;

      case "host-status-response":
        logger.debug("HostCommunication", "Host 状态", { data: message.data });
        // 通知 UI Host 状态
        pixso.ui.postMessage({
          type: "host-status",
          data: message.data,
        });
        this.notifyCallbacks("host-status", message);
        break;

      case "custom-action-result":
        logger.debug("HostCommunication", "自定义操作结果", { data: message.data });
        // 通知 UI 自定义操作结果
        pixso.ui.postMessage({
          type: "custom-action-result",
          data: message.data,
        });
        this.notifyCallbacks("custom-action", message);
        break;

      default:
        logger.warn("HostCommunication", "未处理的 Host 消息", { type: message.type });
    }
  }

  /**
   * 注册消息回调
   */
  onResponse(type: string, callback: (response: HostMessage) => void): void {
    const callbacks = this.messageCallbacks.get(type) || [];
    callbacks.push(callback);
    this.messageCallbacks.set(type, callbacks);
  }

  /**
   * 通知所有注册的回调
   */
  private notifyCallbacks(type: string, message: HostMessage): void {
    const callbacks = this.messageCallbacks.get(type);
    if (callbacks) {
      callbacks.forEach((callback) => callback(message));
    }
  }

  /**
   * 发送消息到 Host（通过 UI 转发）
   *
   * 由于 Pixso sandbox 环境限制，sandbox 不能直接发送消息到 host。
   * 消息会被转发到 UI，再由 UI 发送到 Host（如果需要）。
   * 或者等待 Host 主动轮询时响应。
   */
  sendToHost(message: HostMessage): void {
    if (!this.hostReady && message.type !== "ping") {
      // 如果 Host 未就绪，将消息加入待处理队列
      // 检查队列是否已满，防止内存泄漏
      if (this.pendingMessages.length >= HostCommunicationManager.MAX_PENDING_MESSAGES) {
        const droppedMessage = this.pendingMessages.shift();
        logger.warn("HostCommunication", "待处理消息队列已满，丢弃最早的消息", {
          type: droppedMessage?.type,
          timestamp: droppedMessage?.timestamp,
        });
      }
      this.pendingMessages.push(message);
      logger.debug("HostCommunication", "Host 未就绪，消息已加入队列", { type: message.type });
      return;
    }

    // 将消息转发到 UI，UI 可以决定是否需要进一步处理
    // 注意：实际的 Host 通信是通过 UI -> Host 的间接方式完成
    pixso.ui.postMessage({
      type: "sandbox-to-host",
      data: message,
    });
    logger.debug("HostCommunication", "消息已转发到 UI（目标: Host）", { message });
  }

  /**
   * 发送待处理的消息
   */
  private flushPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (message) {
        this.sendToHost(message);
      }
    }
  }

  /**
   * 检查 Host 是否就绪
   */
  isHostReady(): boolean {
    return this.hostReady;
  }

  /**
   * 请求 Host 显示插件坞
   */
  requestShowDock(): void {
    this.sendToHost({ type: "show-dock", timestamp: Date.now() });
  }

  /**
   * 请求 Host 执行自定义操作
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestCustomAction(data: any): void {
    this.sendToHost({ type: "custom-action", data, timestamp: Date.now() });
  }
}

// 创建 Host 通信管理器实例
const hostCommunication = new HostCommunicationManager();

/**
 * 布局约束类型映射（从内部类型到 Pixso 类型）
 */
const CONSTRAINT_TYPE_MAP: Record<ConstraintType, "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE"> =
  {
    min: "MIN",
    center: "CENTER",
    max: "MAX",
    stretch: "STRETCH",
    scale: "SCALE",
  };

// 图片识别配置
// 可以通过环境变量或配置文件设置 OpenAPI 配置
let recognitionConfig: ImageRecognitionConfig = {
  enableLocalFallback: true,
  colorThreshold: 30,
  minRegionSize: 20,
};

// 创建图片识别管理器
let imageRecognitionManager = new ImageRecognitionManager(recognitionConfig);

/**
 * UI 传来的设置接口
 */
interface UISettings {
  processingMode: "local" | "openapi";
  openApiProvider: "openai" | "alibaba" | "gemini";
  openApiEndpoint: string;
  openApiKey: string;
  openApiModel: string;
}

/**
 * 更新图片识别配置
 */
function updateRecognitionConfig(settings: UISettings): void {
  // 只有在 OpenAPI 模式下才设置 OpenAPI 相关配置
  const isOpenApiMode = settings.processingMode === "openapi";

  // 基础配置
  const baseConfig: ImageRecognitionConfig = {
    enableLocalFallback: true,
    colorThreshold: 30,
    minRegionSize: 20,
  };

  // 如果是 OpenAPI 模式，添加 OpenAPI 相关配置
  if (isOpenApiMode) {
    recognitionConfig = {
      ...baseConfig,
      openApiProvider: settings.openApiProvider,
      openApiEndpoint: settings.openApiEndpoint || undefined,
      openApiKey: settings.openApiKey || undefined,
      openApiModel: settings.openApiModel || undefined,
    };
  } else {
    recognitionConfig = baseConfig;
  }

  // 重新创建图片识别管理器
  imageRecognitionManager = new ImageRecognitionManager(recognitionConfig);
  logger.info("Main", "图片识别配置已更新", {
    processingMode: settings.processingMode,
    provider: isOpenApiMode ? settings.openApiProvider : "none",
    hasApiKey: isOpenApiMode && !!settings.openApiKey,
  });
}

// 缓存字体加载状态
let fontLoaded = false;
let fontLoadPromise: Promise<void> | null = null;

/**
 * 加载默认字体（带缓存）
 */
async function ensureFontLoaded(): Promise<void> {
  if (fontLoaded) return;

  if (!fontLoadPromise) {
    logger.debug("FontLoader", "开始加载字体");
    fontLoadPromise = pixso
      .loadFontAsync({ family: "Inter", style: "Regular" })
      .catch(() => {
        logger.warn("FontLoader", "Inter 字体加载失败，尝试 Arial");
        return pixso.loadFontAsync({ family: "Arial", style: "Regular" });
      })
      .then(() => {
        fontLoaded = true;
        logger.info("FontLoader", "字体加载完成");
      })
      .catch((error) => {
        logger.error("FontLoader", "所有字体加载失败", { error });
        throw error;
      });
  }

  return fontLoadPromise;
}

// 默认超时时间（毫秒）
const DEFAULT_ANALYSIS_TIMEOUT = 30000; // 30秒
const OPENAPI_ANALYSIS_TIMEOUT = 60000; // OpenAPI 模式 60秒
// 关闭插件前的延迟时间（毫秒），确保 UI 有时间接收消息
const CLOSE_PLUGIN_DELAY_MS = 100;

/**
 * 带超时的 Promise 包装器
 * @param promise - 要执行的 Promise
 * @param timeoutMs - 超时时间（毫秒）
 * @param timeoutMessage - 超时错误信息
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

pixso.showUI(__html__, { width: 400, height: 560 });

// 初始化 Host 通信
hostCommunication.init();

logger.info("Main", "插件初始化完成");

pixso.ui.onmessage = async (msg) => {
  logger.debug("Main", "收到 UI 消息", { type: msg.type });

  // 检查是否为 Host 消息转发
  if (msg.type === "host-message") {
    hostCommunication.handleHostMessage(msg.data);
    return;
  }

  if (msg.type === "upload-image") {
    // 如果消息中包含设置，先更新配置
    if (msg.settings) {
      updateRecognitionConfig(msg.settings);
    }
    await handleImageUpload(msg.data, msg.fileName, msg.settings);
  } else if (msg.type === "openapi-analysis-result") {
    // 处理来自 UI 的 OpenAPI 分析结果
    // UI 层完成网络请求后，将结果发送到 sandbox 进行元素生成
    await handleOpenApiAnalysisResult(msg.data, msg.fileName, msg.originalImageData);
  } else if (msg.type === "update-settings") {
    // 处理设置更新消息
    if (msg.settings) {
      updateRecognitionConfig(msg.settings);
    }
  } else if (msg.type === "request-host-status") {
    // 请求 Host 状态
    const timestamp = Date.now();
    hostCommunication.sendToHost({ type: "host-status", timestamp });
    // 同时返回 Sandbox 端的状态
    pixso.ui.postMessage({
      type: "sandbox-status",
      data: {
        hostReady: hostCommunication.isHostReady(),
        timestamp,
      },
    });
  } else if (msg.type === "show-plugin-dock") {
    // 请求显示插件坞
    hostCommunication.requestShowDock();
  } else if (msg.type === "custom-host-action") {
    // 执行自定义 Host 操作
    hostCommunication.requestCustomAction(msg.data);
  } else if (msg.type === "create-rectangles") {
    // 保留原有功能以便兼容
    const nodes: SceneNode[] = [];
    for (let i = 0; i < msg.count; i++) {
      const rect = pixso.createRectangle();
      rect.x = i * 150;
      rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }];
      pixso.currentPage.appendChild(rect);
      nodes.push(rect);
    }
    pixso.currentPage.selection = nodes;
    pixso.viewport.scrollAndZoomIntoView(nodes);
    pixso.closePlugin();
  } else if (msg.type === "cancel") {
    logger.info("Main", "用户取消操作");
    pixso.closePlugin();
  }
};

/**
 * 处理图片上传
 * @param imageData - Base64 编码的图片数据
 * @param fileName - 文件名
 * @param settings - UI 设置（可选）
 */
async function handleImageUpload(
  imageData: string,
  fileName: string,
  settings?: UISettings
): Promise<void> {
  const startTime = Date.now();
  const processingMode = settings?.processingMode || "local";
  logger.info("ImageUpload", "开始处理图片", { fileName, processingMode });

  // 通知 UI 开始处理
  pixso.ui.postMessage({ type: "processing", message: "正在分析图片...", progress: 10 });

  try {
    // 检查 OpenAPI 模式下是否配置了 API 密钥
    if (processingMode === "openapi" && !settings?.openApiKey) {
      logger.warn("ImageUpload", "OpenAPI 模式未配置 API 密钥，终止处理");
      pixso.ui.postMessage({
        type: "error",
        message: "未配置 API 密钥",
        suggestion: "请在设置中输入 API 密钥，或切换为本地处理模式",
      });
      // 延迟关闭插件，确保 UI 有时间接收并处理消息
      setTimeout(() => pixso.closePlugin(), CLOSE_PLUGIN_DELAY_MS);
      return;
    }

    // 使用图片识别服务分析图片
    // 根据设置选择处理模式
    // 启用布局分析以生成响应式约束
    logger.debug("ImageUpload", "开始图片分析", { mode: processingMode });

    const modeMessage =
      processingMode === "openapi"
        ? "正在使用 AI 识别图片内容..."
        : "正在加载并分析图片...";
    pixso.ui.postMessage({ type: "processing", message: modeMessage, progress: 25 });

    // 根据处理模式选择超时时间
    const timeoutMs =
      processingMode === "openapi" ? OPENAPI_ANALYSIS_TIMEOUT : DEFAULT_ANALYSIS_TIMEOUT;
    const timeoutMessage =
      processingMode === "openapi"
        ? "AI 分析超时，请检查网络连接或稍后重试"
        : "本地图片分析超时，可能是沙箱环境不支持 Canvas API";

    // 使用超时包装器执行分析
    logger.debug("ImageUpload", "调用图片识别服务");
    const analysisResult = await withTimeout(
      imageRecognitionManager.analyze(imageData, processingMode, true),
      timeoutMs,
      timeoutMessage
    );

    if (!analysisResult.success) {
      const error = new Error(analysisResult.error || "图片分析失败");
      logger.error("ImageUpload", "图片分析失败", { error: analysisResult.error });
      throw error;
    }

    logger.info("ImageUpload", "图片分析完成", {
      elementsCount: analysisResult.elements.length,
      width: analysisResult.width,
      height: analysisResult.height,
    });

    // 更新进度
    pixso.ui.postMessage({
      type: "processing",
      message: `分析完成，识别到 ${analysisResult.elements.length} 个元素`,
      progress: 50,
    });

    // 根据分析结果生成设计元素
    pixso.ui.postMessage({ type: "processing", message: "正在生成设计元素...", progress: 60 });

    const nodes = await generateDesignElements(analysisResult, fileName, imageData);

    logger.info("ImageUpload", "设计元素生成完成", { nodesCount: nodes.length });

    // 更新进度
    pixso.ui.postMessage({ type: "processing", message: "正在完成设计...", progress: 90 });

    // 选中生成的元素并调整视图
    if (nodes.length > 0) {
      pixso.currentPage.selection = nodes;
      pixso.viewport.scrollAndZoomIntoView(nodes);
    }

    const duration = Date.now() - startTime;
    logger.info("ImageUpload", "图片处理完成", {
      duration: `${duration}ms`,
      elementsCreated: nodes.length,
    });

    // 通知 UI 处理完成
    pixso.ui.postMessage({
      type: "complete",
      message: `设计生成完成，共创建 ${nodes.length} 个元素（耗时 ${(duration / 1000).toFixed(1)}s）`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知错误";

    // 根据错误信息确定错误类型
    let errorType = ProcessErrorType.UNKNOWN;
    if (errorMessage.includes("超时") || errorMessage.includes("timeout")) {
      errorType = ProcessErrorType.TIMEOUT;
    } else if (
      errorMessage.includes("Canvas") ||
      errorMessage.includes("canvas") ||
      errorMessage.includes("沙箱") ||
      errorMessage.includes("sandbox") ||
      errorMessage.includes("OpenAPI 模式")
    ) {
      errorType = ProcessErrorType.CANVAS_ERROR;
    } else if (errorMessage.includes("分析")) {
      errorType = ProcessErrorType.IMAGE_ANALYSIS;
    }

    logger.error("ImageUpload", "图片处理失败", {
      error: errorMessage,
      errorType,
      duration: `${Date.now() - startTime}ms`,
    });

    const suggestion = getErrorSuggestion(errorType, errorMessage);
    pixso.ui.postMessage({
      type: "error",
      message: `处理失败: ${errorMessage}`,
      suggestion,
    });
  }

  // 延迟关闭插件，确保 UI 有时间接收并处理消息
  setTimeout(() => pixso.closePlugin(), CLOSE_PLUGIN_DELAY_MS);
}

/**
 * 根据分析结果生成 Pixso 设计元素
 * @param analysisResult - 图片分析结果
 * @param fileName - 文件名
 * @param originalImageData - 原始图片数据
 * @returns 生成的节点列表
 */
async function generateDesignElements(
  analysisResult: ImageAnalysisResult,
  fileName: string,
  originalImageData: string
): Promise<SceneNode[]> {
  const nodes: SceneNode[] = [];

  logger.debug("ElementGeneration", "开始生成设计元素", {
    elementsCount: analysisResult.elements.length,
  });

  // 创建一个 Frame 作为容器
  const frame = pixso.createFrame();
  frame.name = fileName || "Uploaded Image Design";
  frame.x = 0;
  frame.y = 0;
  frame.resize(analysisResult.width || 400, analysisResult.height || 300);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  pixso.currentPage.appendChild(frame);
  nodes.push(frame);

  // 遍历识别到的元素并创建对应的 Pixso 元素
  let successCount = 0;
  let failCount = 0;

  for (const element of analysisResult.elements) {
    try {
      const node = await createElementNode(element, originalImageData);
      if (node) {
        // 应用布局约束
        if (element.layout?.constraints) {
          applyConstraints(node, element.layout.constraints);
        }

        // 应用效果（阴影、模糊）
        if (element.effects && element.effects.length > 0) {
          applyEffects(node, element.effects);
        }

        frame.appendChild(node);
        nodes.push(node);
        successCount++;
      }
    } catch (error) {
      failCount++;
      logger.warn("ElementGeneration", "创建元素失败", {
        elementType: element.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("ElementGeneration", "元素生成完成", {
    success: successCount,
    failed: failCount,
    total: analysisResult.elements.length,
  });

  return nodes;
}

/**
 * 根据识别到的元素创建 Pixso 节点
 * @param element - 识别到的元素
 * @param originalImageData - 原始图片数据
 * @returns 创建的节点
 */
async function createElementNode(
  element: RecognizedElement,
  originalImageData: string
): Promise<SceneNode | null> {
  const color = element.color || { r: 0.9, g: 0.9, b: 0.9 };

  switch (element.type) {
    case "rectangle":
    case "frame": {
      const rect = pixso.createRectangle();
      rect.x = element.x;
      rect.y = element.y;
      rect.resize(element.width || 100, element.height || 100);

      // 应用填充（支持渐变）
      rect.fills = createFills(color, element.gradient);

      return rect;
    }

    case "circle": {
      const ellipse = pixso.createEllipse();
      ellipse.x = element.x;
      ellipse.y = element.y;
      ellipse.resize(element.width || 100, element.height || 100);

      // 应用填充（支持渐变）
      ellipse.fills = createFills(color, element.gradient);

      return ellipse;
    }

    case "text": {
      const text = pixso.createText();
      text.x = element.x;
      text.y = element.y;
      // 使用缓存的字体加载
      await ensureFontLoaded();
      text.characters = element.text || "Text";
      if (element.fontSize) {
        text.fontSize = element.fontSize;
      }
      text.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b } }];
      return text;
    }

    case "line": {
      const line = pixso.createLine();
      line.x = element.x;
      line.y = element.y;
      line.resize(element.width || 100, 0);
      line.strokes = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b } }];
      return line;
    }

    case "image": {
      // 处理图片元素
      return await createImageNode(element, originalImageData);
    }

    default:
      logger.warn("ElementGeneration", "未知的元素类型", { type: element.type });
      return null;
  }
}

/**
 * 创建图片节点
 * @param element - 识别到的图片元素
 * @param originalImageData - 原始图片数据（用于区域裁剪）
 * @returns 创建的节点
 */
async function createImageNode(
  element: RecognizedElement,
  originalImageData: string
): Promise<SceneNode | null> {
  try {
    // 如果元素有自己的图片数据，使用它
    const imageDataToUse = element.imageData || originalImageData;

    if (!imageDataToUse) {
      // 如果没有图片数据，创建占位符
      logger.warn("ElementGeneration", "图片数据为空，创建占位符");
      return createImagePlaceholder(element);
    }

    // 从 Base64 数据创建图片
    const imageBytes = base64ToUint8Array(imageDataToUse);
    const image = pixso.createImage(imageBytes);

    // 创建矩形并设置图片填充
    const rect = pixso.createRectangle();
    rect.x = element.x;
    rect.y = element.y;
    rect.resize(element.width || 100, element.height || 100);
    rect.name = "Image";

    // 设置图片填充
    rect.fills = [
      {
        type: "IMAGE",
        scaleMode: "FILL",
        imageHash: image.hash,
      },
    ];

    return rect;
  } catch (error) {
    logger.error("ElementGeneration", "创建图片节点失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    // 失败时返回占位符
    return createImagePlaceholder(element);
  }
}

/**
 * 创建图片占位符
 * @param element - 元素信息
 * @returns 占位符节点
 */
function createImagePlaceholder(element: RecognizedElement): SceneNode {
  const rect = pixso.createRectangle();
  rect.x = element.x;
  rect.y = element.y;
  rect.resize(element.width || 100, element.height || 100);
  rect.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
  rect.strokes = [{ type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.7 } }];
  rect.strokeWeight = 1;
  rect.name = "Image Placeholder";
  return rect;
}

/**
 * 创建填充数组（支持纯色和渐变）
 * @param color - 纯色信息
 * @param gradient - 渐变信息（可选）
 * @returns 填充数组
 */
function createFills(color: ColorInfo, gradient?: GradientInfo): Paint[] {
  if (gradient && gradient.stops.length >= 2) {
    return [createGradientPaint(gradient)];
  }

  return [
    {
      type: "SOLID",
      color: { r: color.r, g: color.g, b: color.b },
      opacity: color.a ?? 1,
    },
  ];
}

/**
 * 创建渐变填充
 * @param gradient - 渐变信息
 * @returns 渐变填充
 */
function createGradientPaint(gradient: GradientInfo): GradientPaint {
  // 转换渐变类型
  const gradientTypeMap: Record<string, GradientPaint["type"]> = {
    linear: "GRADIENT_LINEAR",
    radial: "GRADIENT_RADIAL",
    angular: "GRADIENT_ANGULAR",
    diamond: "GRADIENT_DIAMOND",
  };

  const gradientType = gradientTypeMap[gradient.type] || "GRADIENT_LINEAR";

  // 转换颜色停止点
  const gradientStops: ColorStop[] = gradient.stops.map((stop) => ({
    position: stop.position,
    color: {
      r: stop.color.r,
      g: stop.color.g,
      b: stop.color.b,
      a: stop.color.a ?? 1,
    },
  }));

  // 计算渐变变换矩阵（基于角度）
  const angle = gradient.angle ?? 0;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // 创建变换矩阵
  const gradientTransform: Transform = [
    [cos, -sin, 0.5 - cos * 0.5 + sin * 0.5],
    [sin, cos, 0.5 - sin * 0.5 - cos * 0.5],
  ];

  return {
    type: gradientType,
    gradientTransform,
    gradientStops,
  };
}

/**
 * 应用布局约束
 * @param node - 节点
 * @param constraints - 约束信息
 */
function applyConstraints(node: SceneNode, constraints: LayoutConstraints): void {
  // 检查节点是否支持约束
  if (!("constraints" in node)) {
    return;
  }

  // 设置约束
  (node as RectangleNode).constraints = {
    horizontal: CONSTRAINT_TYPE_MAP[constraints.horizontal] || "MIN",
    vertical: CONSTRAINT_TYPE_MAP[constraints.vertical] || "MIN",
  };
}

/**
 * 应用效果（阴影、模糊）
 * @param node - 节点
 * @param effects - 效果数组
 */
function applyEffects(node: SceneNode, effects: ElementEffect[]): void {
  // 检查节点是否支持效果
  if (!("effects" in node)) {
    return;
  }

  const pixsoEffects: Effect[] = effects
    .map((effect) => {
      if ("offsetX" in effect) {
        // 阴影效果
        return createShadowEffect(effect as ShadowEffect);
      } else if ("radius" in effect) {
        // 模糊效果
        return createBlurEffect(effect as BlurEffect);
      }
      return null;
    })
    .filter((e): e is Effect => e !== null);

  if (pixsoEffects.length > 0) {
    (node as RectangleNode).effects = pixsoEffects;
  }
}

/**
 * 创建阴影效果
 * @param shadow - 阴影信息
 * @returns Pixso 阴影效果
 */
function createShadowEffect(shadow: ShadowEffect): DropShadowEffect | InnerShadowEffect {
  const color: RGBA = {
    r: shadow.color.r,
    g: shadow.color.g,
    b: shadow.color.b,
    a: shadow.color.a ?? 0.25,
  };

  if (shadow.type === "inner") {
    return {
      type: "INNER_SHADOW",
      color,
      offset: { x: shadow.offsetX, y: shadow.offsetY },
      radius: shadow.blur,
      spread: shadow.spread ?? 0,
      visible: true,
      blendMode: "NORMAL",
    };
  }

  return {
    type: "DROP_SHADOW",
    color,
    offset: { x: shadow.offsetX, y: shadow.offsetY },
    radius: shadow.blur,
    spread: shadow.spread ?? 0,
    visible: true,
    blendMode: "NORMAL",
  };
}

/**
 * 创建模糊效果
 * @param blur - 模糊信息
 * @returns Pixso 模糊效果
 */
function createBlurEffect(blur: BlurEffect): Effect {
  return {
    type: blur.type === "background" ? "BACKGROUND_BLUR" : "LAYER_BLUR",
    radius: blur.radius,
    visible: true,
  };
}

/**
 * Base64 字符串转 Uint8Array
 * @param base64 - Base64 编码的字符串（可能包含 data URL 前缀）
 * @returns Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // 移除 data URL 前缀
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

  // 使用 Pixso 提供的解码方法
  return pixso.base64Decode(base64Data);
}
