/**
 * 错误处理服务
 * 提供统一的错误处理、友好的错误提示和恢复机制
 */

import { logger } from "./logger";

/**
 * 错误类型枚举
 */
export enum ErrorType {
  FILE_FORMAT = "FILE_FORMAT",
  FILE_SIZE = "FILE_SIZE",
  FILE_READ = "FILE_READ",
  IMAGE_PROCESS = "IMAGE_PROCESS",
  NETWORK = "NETWORK",
  API = "API",
  UNKNOWN = "UNKNOWN",
}

/**
 * 应用错误类
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly suggestion: string;
  public readonly recoverable: boolean;
  public readonly originalError?: Error;

  constructor(
    type: ErrorType,
    message: string,
    suggestion: string,
    recoverable: boolean = true,
    originalError?: Error
  ) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.suggestion = suggestion;
    this.recoverable = recoverable;
    this.originalError = originalError;
  }
}

/**
 * 错误信息映射
 */
interface ErrorInfo {
  message: string;
  suggestion: string;
  recoverable: boolean;
}

/**
 * 错误类型到友好信息的映射
 */
const ERROR_INFO_MAP: Record<ErrorType, ErrorInfo> = {
  [ErrorType.FILE_FORMAT]: {
    message: "不支持的文件格式",
    suggestion: "请上传 PNG、JPG、JPEG 或 WebP 格式的图片文件",
    recoverable: true,
  },
  [ErrorType.FILE_SIZE]: {
    message: "文件大小超过限制",
    suggestion: "请上传不超过 10MB 的图片文件，或尝试压缩图片后重新上传",
    recoverable: true,
  },
  [ErrorType.FILE_READ]: {
    message: "文件读取失败",
    suggestion: "请检查文件是否损坏，或尝试重新选择文件",
    recoverable: true,
  },
  [ErrorType.IMAGE_PROCESS]: {
    message: "图片处理失败",
    suggestion: "请尝试使用其他图片，或检查图片是否完整无损",
    recoverable: true,
  },
  [ErrorType.NETWORK]: {
    message: "网络连接失败",
    suggestion: "请检查网络连接后重试",
    recoverable: true,
  },
  [ErrorType.API]: {
    message: "服务调用失败",
    suggestion: "服务暂时不可用，请稍后重试",
    recoverable: true,
  },
  [ErrorType.UNKNOWN]: {
    message: "未知错误",
    suggestion: "请刷新插件后重试，如问题持续请联系支持",
    recoverable: false,
  },
};

/**
 * 创建应用错误
 */
export function createAppError(
  type: ErrorType,
  customMessage?: string,
  originalError?: Error
): AppError {
  const errorInfo = ERROR_INFO_MAP[type];
  const message = customMessage || errorInfo.message;

  logger.error("ErrorHandler", message, {
    type,
    originalError: originalError?.message,
    stack: originalError?.stack,
  });

  return new AppError(type, message, errorInfo.suggestion, errorInfo.recoverable, originalError);
}

/**
 * 解析错误并转换为 AppError
 */
export function parseError(error: unknown): AppError {
  // 如果已经是 AppError，直接返回
  if (error instanceof AppError) {
    return error;
  }

  // 如果是普通 Error
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // 尝试识别错误类型
    if (message.includes("format") || message.includes("type")) {
      return createAppError(ErrorType.FILE_FORMAT, undefined, error);
    }
    if (message.includes("size") || message.includes("too large")) {
      return createAppError(ErrorType.FILE_SIZE, undefined, error);
    }
    if (message.includes("read") || message.includes("load")) {
      return createAppError(ErrorType.FILE_READ, undefined, error);
    }
    if (message.includes("network") || message.includes("fetch")) {
      return createAppError(ErrorType.NETWORK, undefined, error);
    }
    if (message.includes("api") || message.includes("service")) {
      return createAppError(ErrorType.API, undefined, error);
    }

    // 未知错误
    return createAppError(ErrorType.UNKNOWN, error.message, error);
  }

  // 其他类型的错误
  const errorMessage = String(error);
  return createAppError(ErrorType.UNKNOWN, errorMessage);
}

/**
 * 获取用户友好的错误消息
 */
export function getFriendlyErrorMessage(error: unknown): { message: string; suggestion: string } {
  const appError = parseError(error);
  return {
    message: appError.message,
    suggestion: appError.suggestion,
  };
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * 带重试的异步函数执行器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier, onRetry } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn("ErrorHandler", `尝试 ${attempt}/${maxAttempts} 失败`, {
        error: lastError.message,
        nextRetryDelay: currentDelay,
      });

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);

        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        currentDelay *= backoffMultiplier;
      }
    }
  }

  throw lastError || new Error("重试失败");
}

/**
 * 错误恢复状态
 */
export interface RecoveryState {
  canRetry: boolean;
  retryCount: number;
  maxRetries: number;
  lastError?: AppError;
}

/**
 * 创建错误恢复状态管理器
 */
export function createRecoveryManager(maxRetries: number = 3) {
  let retryCount = 0;
  let lastError: AppError | undefined;

  return {
    /**
     * 获取当前恢复状态
     */
    getState(): RecoveryState {
      return {
        canRetry: retryCount < maxRetries && (lastError?.recoverable ?? true),
        retryCount,
        maxRetries,
        lastError,
      };
    },

    /**
     * 记录错误
     */
    recordError(error: unknown): RecoveryState {
      lastError = parseError(error);
      retryCount++;
      return this.getState();
    },

    /**
     * 重置状态
     */
    reset(): void {
      retryCount = 0;
      lastError = undefined;
    },

    /**
     * 获取最后的错误
     */
    getLastError(): AppError | undefined {
      return lastError;
    },
  };
}

export default {
  createAppError,
  parseError,
  getFriendlyErrorMessage,
  withRetry,
  createRecoveryManager,
};
