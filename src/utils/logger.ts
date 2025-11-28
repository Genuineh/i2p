/**
 * 统一日志记录服务
 * 提供结构化的日志记录功能，支持不同级别的日志
 */

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

/**
 * 日志记录器配置
 */
export interface LoggerConfig {
  minLevel?: LogLevel;
  maxEntries?: number;
  enableConsole?: boolean;
}

/**
 * 日志记录器类
 */
class Logger {
  private logs: LogEntry[] = [];
  private minLevel: LogLevel = LogLevel.DEBUG;
  private maxEntries: number = 1000;
  private enableConsole: boolean = true;
  private listeners: ((entry: LogEntry) => void)[] = [];

  /**
   * 配置日志记录器
   */
  configure(config: LoggerConfig): void {
    if (config.minLevel !== undefined) {
      this.minLevel = config.minLevel;
    }
    if (config.maxEntries !== undefined) {
      this.maxEntries = config.maxEntries;
    }
    if (config.enableConsole !== undefined) {
      this.enableConsole = config.enableConsole;
    }
  }

  /**
   * 添加日志监听器
   */
  addListener(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 记录日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private log(level: LogLevel, category: string, message: string, data?: any): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
    };

    // 存储日志
    this.logs.push(entry);

    // 限制日志数量
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }

    // 输出到控制台
    if (this.enableConsole) {
      this.logToConsole(entry);
    }

    // 通知监听器
    this.listeners.forEach((listener) => listener(entry));
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: LogEntry): void {
    const prefix = `[${this.getLevelName(entry.level)}][${entry.category}]`;
    const timestamp = entry.timestamp.toISOString();

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${timestamp} ${prefix} ${entry.message}`, entry.data ?? "");
        break;
      case LogLevel.INFO:
        console.info(`${timestamp} ${prefix} ${entry.message}`, entry.data ?? "");
        break;
      case LogLevel.WARN:
        console.warn(`${timestamp} ${prefix} ${entry.message}`, entry.data ?? "");
        break;
      case LogLevel.ERROR:
        console.error(`${timestamp} ${prefix} ${entry.message}`, entry.data ?? "");
        break;
    }
  }

  /**
   * 获取级别名称
   */
  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return "DEBUG";
      case LogLevel.INFO:
        return "INFO";
      case LogLevel.WARN:
        return "WARN";
      case LogLevel.ERROR:
        return "ERROR";
      default:
        return "UNKNOWN";
    }
  }

  /**
   * 调试日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  /**
   * 信息日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  /**
   * 警告日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  /**
   * 错误日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(category: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  /**
   * 获取所有日志
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 获取指定级别的日志
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((entry) => entry.level === level);
  }

  /**
   * 获取指定类别的日志
   */
  getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter((entry) => entry.category === category);
  }

  /**
   * 清除日志
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * 导出日志为字符串
   */
  export(): string {
    return this.logs
      .map((entry) => {
        const data = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : "";
        return `${entry.timestamp.toISOString()} [${this.getLevelName(entry.level)}][${entry.category}] ${entry.message}${data}`;
      })
      .join("\n");
  }
}

// 创建单例实例
export const logger = new Logger();

// 默认导出
export default logger;
