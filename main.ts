import {
  ImageRecognitionManager,
  ImageAnalysisResult,
  RecognizedElement,
  ImageRecognitionConfig,
} from "./src/services";

// 图片识别配置
// 可以通过环境变量或配置文件设置 OpenAPI 配置
const recognitionConfig: ImageRecognitionConfig = {
  enableLocalFallback: true,
  colorThreshold: 30,
  minRegionSize: 20,
  // OpenAPI 配置（如果需要使用 AI 识别，请配置以下参数）
  // openApiEndpoint: 'https://api.openai.com/v1/chat/completions',
  // openApiKey: 'your-api-key',
  // openApiModel: 'gpt-4-vision-preview',
};

// 创建图片识别管理器
const imageRecognitionManager = new ImageRecognitionManager(recognitionConfig);

// 缓存字体加载状态
let fontLoaded = false;
let fontLoadPromise: Promise<void> | null = null;

/**
 * 加载默认字体（带缓存）
 */
async function ensureFontLoaded(): Promise<void> {
  if (fontLoaded) return;

  if (!fontLoadPromise) {
    fontLoadPromise = pixso
      .loadFontAsync({ family: "Inter", style: "Regular" })
      .catch(() => pixso.loadFontAsync({ family: "Arial", style: "Regular" }))
      .then(() => {
        fontLoaded = true;
      });
  }

  return fontLoadPromise;
}

pixso.showUI(__html__, { width: 400, height: 520 });

pixso.ui.onmessage = async (msg) => {
  if (msg.type === "upload-image") {
    await handleImageUpload(msg.data, msg.fileName);
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
    pixso.closePlugin();
  }
};

/**
 * 处理图片上传
 * @param imageData - Base64 编码的图片数据
 * @param fileName - 文件名
 */
async function handleImageUpload(imageData: string, fileName: string): Promise<void> {
  console.log("Received image:", fileName);

  // 通知 UI 开始处理
  pixso.ui.postMessage({ type: "processing", message: "正在分析图片..." });

  try {
    // 使用图片识别服务分析图片
    // 默认使用本地处理器，如需使用 OpenAPI 服务，可改为 'openapi'
    const analysisResult = await imageRecognitionManager.analyze(imageData, "local");

    if (!analysisResult.success) {
      throw new Error(analysisResult.error || "图片分析失败");
    }

    console.log("分析结果:", analysisResult);

    // 根据分析结果生成设计元素
    const nodes = await generateDesignElements(analysisResult, fileName);

    // 选中生成的元素并调整视图
    if (nodes.length > 0) {
      pixso.currentPage.selection = nodes;
      pixso.viewport.scrollAndZoomIntoView(nodes);
    }

    // 通知 UI 处理完成
    pixso.ui.postMessage({
      type: "complete",
      message: `设计生成完成，共创建 ${nodes.length} 个元素`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    console.error("图片处理失败:", errorMessage);
    pixso.ui.postMessage({ type: "error", message: `处理失败: ${errorMessage}` });
  }

  pixso.closePlugin();
}

/**
 * 根据分析结果生成 Pixso 设计元素
 * @param analysisResult - 图片分析结果
 * @param fileName - 文件名
 * @returns 生成的节点列表
 */
async function generateDesignElements(
  analysisResult: ImageAnalysisResult,
  fileName: string
): Promise<SceneNode[]> {
  const nodes: SceneNode[] = [];

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
  for (const element of analysisResult.elements) {
    const node = await createElementNode(element);
    if (node) {
      frame.appendChild(node);
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * 根据识别到的元素创建 Pixso 节点
 * @param element - 识别到的元素
 * @returns 创建的节点
 */
async function createElementNode(element: RecognizedElement): Promise<SceneNode | null> {
  const color = element.color || { r: 0.9, g: 0.9, b: 0.9 };

  switch (element.type) {
    case "rectangle":
    case "frame": {
      const rect = pixso.createRectangle();
      rect.x = element.x;
      rect.y = element.y;
      rect.resize(element.width || 100, element.height || 100);
      rect.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b } }];
      return rect;
    }

    case "circle": {
      const ellipse = pixso.createEllipse();
      ellipse.x = element.x;
      ellipse.y = element.y;
      ellipse.resize(element.width || 100, element.height || 100);
      ellipse.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b } }];
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
      // 图片元素暂时用矩形占位
      const rect = pixso.createRectangle();
      rect.x = element.x;
      rect.y = element.y;
      rect.resize(element.width || 100, element.height || 100);
      rect.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
      rect.name = "Image Placeholder";
      return rect;
    }

    default:
      return null;
  }
}
