/**
 * 图片识别服务类型定义
 */

/**
 * 识别到的设计元素类型
 */
export type ElementType = "rectangle" | "circle" | "text" | "image" | "frame" | "line";

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
  children?: RecognizedElement[];
}

/**
 * 图片分析结果
 */
export interface ImageAnalysisResult {
  width: number;
  height: number;
  elements: RecognizedElement[];
  dominantColors?: ColorInfo[];
  success: boolean;
  error?: string;
}

/**
 * 支持的 AI 提供商类型
 * - openai: OpenAI GPT-4 Vision
 * - alibaba: 阿里云通义千问 (Qwen-VL)
 * - gemini: Google Gemini
 */
export type AIProvider = "openai" | "alibaba" | "gemini";

/**
 * 图片识别服务配置
 */
export interface ImageRecognitionConfig {
  // AI 提供商类型
  openApiProvider?: AIProvider;
  // OpenAPI 配置
  openApiEndpoint?: string;
  openApiKey?: string;
  openApiModel?: string;
  // 本地处理配置
  enableLocalFallback?: boolean;
  colorThreshold?: number;
  minRegionSize?: number;
}

/**
 * 图片识别服务接口
 */
export interface IImageRecognitionService {
  /**
   * 分析图片并返回识别结果
   * @param imageData - Base64 编码的图片数据
   * @returns 分析结果
   */
  analyze(imageData: string): Promise<ImageAnalysisResult>;

  /**
   * 检查服务是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取服务名称
   */
  getName(): string;
}
