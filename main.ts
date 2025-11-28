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

/**
 * 布局约束类型映射（从内部类型到 Pixso 类型）
 */
const CONSTRAINT_TYPE_MAP: Record<ConstraintType, "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE"> = {
  min: "MIN",
  center: "CENTER",
  max: "MAX",
  stretch: "STRETCH",
  scale: "SCALE",
};

// 图片识别配置
// 可以通过环境变量或配置文件设置 OpenAPI 配置
const recognitionConfig: ImageRecognitionConfig = {
  enableLocalFallback: true,
  colorThreshold: 30,
  minRegionSize: 20,
  // AI 提供商配置（支持 openai、alibaba、gemini）
  // openApiProvider: 'openai',  // 可选值: 'openai' | 'alibaba' | 'gemini'
  // openApiKey: 'your-api-key',
  //
  // OpenAI 配置示例:
  // openApiProvider: 'openai',
  // openApiEndpoint: 'https://api.openai.com/v1/chat/completions',  // 可选，使用默认值
  // openApiModel: 'gpt-4-vision-preview',  // 可选，使用默认值
  //
  // 阿里云通义千问配置示例:
  // openApiProvider: 'alibaba',
  // openApiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',  // 可选
  // openApiModel: 'qwen-vl-max',  // 可选，使用默认值
  //
  // Google Gemini 配置示例:
  // openApiProvider: 'gemini',
  // openApiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',  // 可选
  // openApiModel: 'gemini-2.0-flash',  // 可选，使用默认值
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
    // 启用布局分析以生成响应式约束
    const analysisResult = await imageRecognitionManager.analyze(imageData, "local", true);

    if (!analysisResult.success) {
      throw new Error(analysisResult.error || "图片分析失败");
    }

    console.log("分析结果:", analysisResult);

    // 根据分析结果生成设计元素
    const nodes = await generateDesignElements(analysisResult, fileName, imageData);

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
 * @param originalImageData - 原始图片数据
 * @returns 生成的节点列表
 */
async function generateDesignElements(
  analysisResult: ImageAnalysisResult,
  fileName: string,
  originalImageData: string
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
    }
  }

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
    console.error("创建图片节点失败:", error);
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
