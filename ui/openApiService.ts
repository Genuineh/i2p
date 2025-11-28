/**
 * UI 层 OpenAPI 图片识别服务
 * 
 * 根据 Pixso 插件限制，网络请求必须从 UI 层（iframe）发起，
 * 而不能从沙箱（sandbox）发起。
 * 
 * 这个服务在 UI 层处理 API 调用，然后通过 postMessage 将结果发送给沙箱。
 */

// AI 提供商类型
export type AIProvider = "openai" | "alibaba" | "gemini";

/**
 * OpenAPI 服务配置
 */
export interface OpenApiConfig {
  provider: AIProvider;
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * 颜色信息
 */
export interface ColorInfo {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * 识别到的设计元素类型
 */
export type ElementType = "rectangle" | "circle" | "text" | "image" | "frame" | "line";

/**
 * 识别到的设计元素
 */
export interface RecognizedElement {
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: ColorInfo;
  text?: string;
  fontSize?: number;
}

/**
 * 图片分析结果
 */
export interface ImageAnalysisResult {
  width: number;
  height: number;
  elements: RecognizedElement[];
  success: boolean;
  error?: string;
}

/**
 * API 响应中的元素描述
 */
interface ApiElementDescription {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  fontSize?: number;
}

/**
 * API 响应格式
 */
interface ApiResponse {
  elements: ApiElementDescription[];
  width: number;
  height: number;
}

/**
 * 提供商预设配置
 */
interface ProviderPreset {
  defaultEndpoint: string;
  defaultModel: string;
}

/**
 * 各提供商的预设配置
 */
const PROVIDER_PRESETS: Record<AIProvider, ProviderPreset> = {
  openai: {
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4-vision-preview",
  },
  alibaba: {
    defaultEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-vl-max",
  },
  gemini: {
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.0-flash",
  },
};

// API 超时时间（毫秒）
const API_TIMEOUT = 60000;

/**
 * 获取提供商的默认配置
 */
export function getProviderDefaults(provider: AIProvider): ProviderPreset {
  return PROVIDER_PRESETS[provider];
}

/**
 * 调用 OpenAPI 分析图片
 * 这个函数在 UI 层执行，因为 Pixso 沙箱不允许网络请求
 * 
 * @param imageData - Base64 编码的图片数据
 * @param config - API 配置
 * @returns 分析结果
 */
export async function analyzeImageWithOpenApi(
  imageData: string,
  config: OpenApiConfig
): Promise<ImageAnalysisResult> {
  console.log("[UI OpenAPI] 开始分析图片...", { provider: config.provider });

  try {
    // 构建请求体
    const requestBody = buildRequestBody(imageData, config.model);

    // 发送请求
    const response = await sendRequest(config, requestBody);

    // 解析响应
    return parseResponse(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    console.error("[UI OpenAPI] 分析失败:", errorMessage);
    return {
      width: 0,
      height: 0,
      elements: [],
      success: false,
      error: `AI 分析失败: ${errorMessage}`,
    };
  }
}

/**
 * 构建 API 请求体
 * 所有支持的提供商都使用 OpenAI 兼容的请求格式
 */
function buildRequestBody(imageData: string, model: string): object {
  const prompt = `分析这张图片，识别其中的UI设计元素。请以JSON格式返回结果，格式如下：
{
  "width": 图片宽度,
  "height": 图片高度,
  "elements": [
    {
      "type": "rectangle|circle|text|image|frame|line",
      "x": 元素x坐标,
      "y": 元素y坐标,
      "width": 元素宽度,
      "height": 元素高度,
      "color": "十六进制颜色值如#FFFFFF",
      "text": "如果是文本元素，填写文本内容",
      "fontSize": 如果是文本元素，填写字体大小
    }
  ]
}

请尽量准确地识别图片中的按钮、文本、图片、容器等UI元素的位置、大小和颜色。只返回JSON，不要其他说明。`;

  return {
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: imageData,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 4096,
  };
}

/**
 * 发送 API 请求
 */
async function sendRequest(config: OpenApiConfig, requestBody: object): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    console.log("[UI OpenAPI] 发送请求到:", config.endpoint);

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log("[UI OpenAPI] 收到响应");

    // 提取响应内容 - 所有提供商都使用 OpenAI 兼容的响应格式
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    throw new Error("API 响应格式无效");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 解析 API 响应
 */
function parseResponse(content: string): ImageAnalysisResult {
  try {
    // 尝试从响应中提取 JSON
    let parsed: ApiResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      // 如果直接解析失败，查找代码块中的 JSON
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        parsed = JSON.parse(codeBlockMatch[1]);
      } else {
        // 尝试匹配第一个完整的 JSON 对象
        const jsonMatch = content.match(/\{[^{}]*"elements"\s*:\s*\[[^\]]*\][^{}]*\}/);
        if (!jsonMatch) {
          throw new Error("无法从响应中提取JSON");
        }
        parsed = JSON.parse(jsonMatch[0]);
      }
    }

    const elements: RecognizedElement[] = (parsed.elements || []).map((elem) =>
      convertElement(elem)
    );

    console.log("[UI OpenAPI] 解析完成，识别到", elements.length, "个元素");

    return {
      width: parsed.width || 0,
      height: parsed.height || 0,
      elements,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "解析失败";
    throw new Error(`响应解析失败: ${errorMessage}`);
  }
}

/**
 * 转换 API 返回的元素格式
 */
function convertElement(elem: ApiElementDescription): RecognizedElement {
  return {
    type: normalizeElementType(elem.type),
    x: elem.x || 0,
    y: elem.y || 0,
    width: elem.width || 0,
    height: elem.height || 0,
    color: elem.color ? parseColor(elem.color) : undefined,
    text: elem.text,
    fontSize: elem.fontSize,
  };
}

/**
 * 标准化元素类型
 */
function normalizeElementType(type: string): ElementType {
  const typeMap: Record<string, ElementType> = {
    rectangle: "rectangle",
    rect: "rectangle",
    square: "rectangle",
    circle: "circle",
    ellipse: "circle",
    oval: "circle",
    text: "text",
    label: "text",
    button: "rectangle",
    image: "image",
    img: "image",
    picture: "image",
    frame: "frame",
    container: "frame",
    div: "frame",
    line: "line",
    border: "line",
  };

  return typeMap[type.toLowerCase()] || "rectangle";
}

/**
 * 解析颜色字符串
 */
function parseColor(colorStr: string): ColorInfo {
  // 处理十六进制颜色
  const hex = colorStr.replace("#", "");
  if (hex.length === 6) {
    return {
      r: parseInt(hex.substring(0, 2), 16) / 255,
      g: parseInt(hex.substring(2, 4), 16) / 255,
      b: parseInt(hex.substring(4, 6), 16) / 255,
    };
  }
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16) / 255,
      g: parseInt(hex[1] + hex[1], 16) / 255,
      b: parseInt(hex[2] + hex[2], 16) / 255,
    };
  }

  // 默认返回灰色
  return { r: 0.5, g: 0.5, b: 0.5 };
}
