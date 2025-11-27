/**
 * OpenAPI 图片识别服务
 * 支持 OpenAI Vision API 等兼容 OpenAPI 的图片大模型服务
 */

import {
  IImageRecognitionService,
  ImageAnalysisResult,
  RecognizedElement,
  ColorInfo,
  ElementType,
} from "./types";

/**
 * OpenAPI 服务配置
 */
interface OpenApiConfig {
  endpoint: string;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeout?: number;
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
 * OpenAPI 图片识别服务
 * 使用 OpenAI Vision API 或兼容的服务进行智能图片分析
 */
export class OpenApiVisionService implements IImageRecognitionService {
  private config: Required<OpenApiConfig>;

  constructor(config: OpenApiConfig) {
    if (!config.endpoint || !config.apiKey) {
      throw new Error("OpenAPI 配置缺少必要的 endpoint 或 apiKey");
    }

    this.config = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      model: config.model ?? "gpt-4-vision-preview",
      maxTokens: config.maxTokens ?? 4096,
      timeout: config.timeout ?? 30000,
    };
  }

  getName(): string {
    return "OpenApiVisionService";
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 简单检查配置是否有效
      return !!(this.config.endpoint && this.config.apiKey);
    } catch {
      return false;
    }
  }

  async analyze(imageData: string): Promise<ImageAnalysisResult> {
    try {
      // 构建请求体
      const requestBody = this.buildRequestBody(imageData);

      // 发送请求
      const response = await this.sendRequest(requestBody);

      // 解析响应
      return this.parseResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      return {
        width: 0,
        height: 0,
        elements: [],
        success: false,
        error: `OpenAPI 服务调用失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 构建 API 请求体
   */
  private buildRequestBody(imageData: string): object {
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
      model: this.config.model,
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
      max_tokens: this.config.maxTokens,
    };
  }

  /**
   * 发送 API 请求
   */
  private async sendRequest(requestBody: object): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // 提取响应内容
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
  private parseResponse(content: string): ImageAnalysisResult {
    try {
      // 尝试从响应中提取 JSON，使用更精确的匹配
      // 首先尝试直接解析整个内容
      let parsed: ApiResponse;
      try {
        parsed = JSON.parse(content);
      } catch {
        // 如果直接解析失败，查找代码块中的 JSON
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          parsed = JSON.parse(codeBlockMatch[1]);
        } else {
          // 尝试匹配第一个完整的 JSON 对象（非贪婪匹配到包含 elements 数组的对象）
          const jsonMatch = content.match(/\{[^{}]*"elements"\s*:\s*\[[^\]]*\][^{}]*\}/);
          if (!jsonMatch) {
            throw new Error("无法从响应中提取JSON");
          }
          parsed = JSON.parse(jsonMatch[0]);
        }
      }

      const elements: RecognizedElement[] = (parsed.elements || []).map((elem) =>
        this.convertElement(elem)
      );

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
  private convertElement(elem: ApiElementDescription): RecognizedElement {
    return {
      type: this.normalizeElementType(elem.type),
      x: elem.x || 0,
      y: elem.y || 0,
      width: elem.width || 0,
      height: elem.height || 0,
      color: elem.color ? this.parseColor(elem.color) : undefined,
      text: elem.text,
      fontSize: elem.fontSize,
    };
  }

  /**
   * 标准化元素类型
   */
  private normalizeElementType(type: string): ElementType {
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
  private parseColor(colorStr: string): ColorInfo {
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
}
