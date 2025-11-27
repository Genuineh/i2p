/**
 * 图片识别服务管理器
 * 统一管理和调度不同的图片识别服务
 */

import { ImageAnalysisResult, ImageRecognitionConfig } from "./types";
import { LocalImageProcessor } from "./localImageProcessor";
import { OpenApiVisionService } from "./openApiVisionService";

/**
 * 服务类型
 */
export type ServiceType = "local" | "openapi";

/**
 * 图片识别服务管理器
 * 根据配置选择合适的识别服务，支持服务降级
 */
export class ImageRecognitionManager {
  private localProcessor: LocalImageProcessor;
  private openApiService: OpenApiVisionService | null = null;
  private config: ImageRecognitionConfig;

  constructor(config: ImageRecognitionConfig = {}) {
    this.config = {
      enableLocalFallback: config.enableLocalFallback ?? true,
      ...config,
    };

    // 初始化本地处理器（始终可用）
    this.localProcessor = new LocalImageProcessor({
      colorThreshold: config.colorThreshold,
      minRegionSize: config.minRegionSize,
    });

    // 如果提供了 OpenAPI 配置，初始化 OpenAPI 服务
    if (config.openApiKey) {
      try {
        this.openApiService = new OpenApiVisionService({
          provider: config.openApiProvider,
          endpoint: config.openApiEndpoint,
          apiKey: config.openApiKey,
          model: config.openApiModel,
        });
      } catch (error) {
        console.warn("OpenAPI 服务初始化失败:", error);
      }
    }
  }

  /**
   * 分析图片
   * 默认使用本地处理器，如果配置了 OpenAPI 服务则优先尝试使用
   * @param imageData - Base64 编码的图片数据
   * @param preferredService - 首选的服务类型
   */
  async analyze(
    imageData: string,
    preferredService: ServiceType = "local"
  ): Promise<ImageAnalysisResult> {
    // 根据首选服务类型决定处理顺序
    if (preferredService === "openapi" && this.openApiService) {
      // 尝试使用 OpenAPI 服务
      const result = await this.tryOpenApi(imageData);
      if (result.success) {
        return result;
      }

      // OpenAPI 失败，如果启用了本地回退，则使用本地处理器
      if (this.config.enableLocalFallback) {
        console.log("OpenAPI 服务失败，回退到本地处理器");
        return this.tryLocal(imageData);
      }

      return result;
    }

    // 默认使用本地处理器
    return this.tryLocal(imageData);
  }

  /**
   * 使用本地处理器分析图片
   */
  private async tryLocal(imageData: string): Promise<ImageAnalysisResult> {
    try {
      const isAvailable = await this.localProcessor.isAvailable();
      if (!isAvailable) {
        return {
          width: 0,
          height: 0,
          elements: [],
          success: false,
          error: "本地处理器不可用",
        };
      }

      return await this.localProcessor.analyze(imageData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      return {
        width: 0,
        height: 0,
        elements: [],
        success: false,
        error: `本地处理失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 使用 OpenAPI 服务分析图片
   */
  private async tryOpenApi(imageData: string): Promise<ImageAnalysisResult> {
    if (!this.openApiService) {
      return {
        width: 0,
        height: 0,
        elements: [],
        success: false,
        error: "OpenAPI 服务未配置",
      };
    }

    try {
      const isAvailable = await this.openApiService.isAvailable();
      if (!isAvailable) {
        return {
          width: 0,
          height: 0,
          elements: [],
          success: false,
          error: "OpenAPI 服务不可用",
        };
      }

      return await this.openApiService.analyze(imageData);
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
   * 获取可用的服务列表
   */
  async getAvailableServices(): Promise<ServiceType[]> {
    const services: ServiceType[] = [];

    if (await this.localProcessor.isAvailable()) {
      services.push("local");
    }

    if (this.openApiService && (await this.openApiService.isAvailable())) {
      services.push("openapi");
    }

    return services;
  }

  /**
   * 检查 OpenAPI 服务是否已配置
   */
  hasOpenApiService(): boolean {
    return this.openApiService !== null;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ImageRecognitionConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果更新了 OpenAPI 配置，重新初始化服务
    if (config.openApiKey) {
      try {
        this.openApiService = new OpenApiVisionService({
          provider: config.openApiProvider ?? this.config.openApiProvider,
          endpoint: config.openApiEndpoint ?? this.config.openApiEndpoint,
          apiKey: config.openApiKey,
          model: config.openApiModel ?? this.config.openApiModel,
        });
      } catch (error) {
        console.warn("OpenAPI 服务初始化失败:", error);
        this.openApiService = null;
      }
    }
  }
}

// 导出类型和服务
export * from "./types";
export { LocalImageProcessor } from "./localImageProcessor";
export { OpenApiVisionService } from "./openApiVisionService";
