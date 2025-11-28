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
 * 渐变色停止点
 */
export interface GradientStop {
  position: number;
  color: ColorInfo;
}

/**
 * 渐变信息
 */
export interface GradientInfo {
  type: "linear" | "radial" | "angular" | "diamond";
  stops: GradientStop[];
  angle?: number; // 用于线性渐变的角度 (0-360)
}

/**
 * 阴影效果
 */
export interface ShadowEffect {
  type: "drop" | "inner";
  color: ColorInfo;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread?: number;
}

/**
 * 模糊效果
 */
export interface BlurEffect {
  type: "layer" | "background";
  radius: number;
}

/**
 * 元素效果（阴影或模糊）
 */
export type ElementEffect = ShadowEffect | BlurEffect;

/**
 * 布局约束类型
 */
export type ConstraintType = "min" | "center" | "max" | "stretch" | "scale";

/**
 * 布局约束信息
 */
export interface LayoutConstraints {
  horizontal: ConstraintType;
  vertical: ConstraintType;
}

/**
 * 布局信息
 */
export interface LayoutInfo {
  constraints?: LayoutConstraints;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  gap?: number;
  alignment?: "start" | "center" | "end" | "stretch";
  direction?: "horizontal" | "vertical";
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
  gradient?: GradientInfo;
  effects?: ElementEffect[];
  layout?: LayoutInfo;
  text?: string;
  fontSize?: number;
  imageData?: string; // Base64 编码的图片数据
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
  layoutStructure?: LayoutStructure;
  success: boolean;
  error?: string;
}

/**
 * 整体布局结构
 */
export interface LayoutStructure {
  rows: LayoutRow[];
  columns: LayoutColumn[];
  gridInfo?: GridInfo;
}

/**
 * 布局行信息
 */
export interface LayoutRow {
  y: number;
  height: number;
  elements: number[]; // 元素索引
}

/**
 * 布局列信息
 */
export interface LayoutColumn {
  x: number;
  width: number;
  elements: number[]; // 元素索引
}

/**
 * 网格信息
 */
export interface GridInfo {
  columnCount: number;
  rowCount: number;
  columnGap: number;
  rowGap: number;
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
