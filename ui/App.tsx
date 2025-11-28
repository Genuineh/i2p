import * as React from "react";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type DragEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import "./app.css";

// 支持的图片格式
const SUPPORTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

// 本地存储键名
const STORAGE_KEY_GUIDE_SHOWN = "i2p_guide_shown";

// 默认进度值
const DEFAULT_PROCESSING_PROGRESS = 50;

// 上传状态类型
type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  message: string;
  suggestion?: string;
}

// 错误类型到友好信息的映射
const ERROR_SUGGESTIONS: Record<string, string> = {
  format: "请上传 PNG、JPG、JPEG 或 WebP 格式的图片文件",
  size: "请上传不超过 10MB 的图片文件，或尝试压缩图片后重新上传",
  read: "请检查文件是否损坏，或尝试重新选择文件",
  process: "请尝试使用其他图片，或检查图片是否完整无损",
  network: "请检查网络连接后重试",
  default: "请刷新插件后重试，如问题持续请联系支持",
};

/**
 * 根据错误消息获取建议
 */
const getSuggestionFromError = (errorMessage: string): string => {
  const message = (errorMessage || "").toLowerCase();
  if (message.includes("格式") || message.includes("format") || message.includes("type")) {
    return ERROR_SUGGESTIONS.format;
  }
  if (message.includes("大小") || message.includes("size") || message.includes("large")) {
    return ERROR_SUGGESTIONS.size;
  }
  if (message.includes("读取") || message.includes("read") || message.includes("load")) {
    return ERROR_SUGGESTIONS.read;
  }
  if (message.includes("处理") || message.includes("process")) {
    return ERROR_SUGGESTIONS.process;
  }
  if (message.includes("网络") || message.includes("network")) {
    return ERROR_SUGGESTIONS.network;
  }
  return ERROR_SUGGESTIONS.default;
};

const App = () => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const [showGuide, setShowGuide] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastImageDataRef = useRef<{ data: string; name: string } | null>(null);

  // 检查是否首次使用，显示引导
  useEffect(() => {
    try {
      const guideShown = localStorage.getItem(STORAGE_KEY_GUIDE_SHOWN);
      if (!guideShown) {
        setShowGuide(true);
      }
    } catch {
      // 如果 localStorage 不可用，忽略
    }
  }, []);

  // 关闭引导
  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    try {
      localStorage.setItem(STORAGE_KEY_GUIDE_SHOWN, "true");
    } catch {
      // 忽略存储错误
    }
  }, []);

  // 重新显示引导
  const showGuideAgain = useCallback(() => {
    setShowGuide(true);
  }, []);

  // 监听来自主线程的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      switch (msg.type) {
        case "processing":
          setUploadState({
            status: "uploading",
            progress: msg.progress ?? DEFAULT_PROCESSING_PROGRESS,
            message: msg.message || "正在处理...",
          });
          break;
        case "complete":
          setUploadState({
            status: "success",
            progress: 100,
            message: msg.message || "处理完成",
          });
          setRetryCount(0); // 成功后重置重试计数
          break;
        case "error":
          setUploadState({
            status: "error",
            progress: 0,
            message: msg.message || "处理失败",
            suggestion: msg.suggestion || getSuggestionFromError(msg.message),
          });
          break;
        case "host-ready":
          console.log("Host 脚本已就绪:", msg.data);
          break;
        case "host-unmounting":
          console.log("Host 脚本即将卸载");
          break;
        case "host-status":
          console.log("Host 状态:", msg.data);
          break;
        case "custom-action-result":
          console.log("自定义操作结果:", msg.data);
          break;
        case "sandbox-status":
          console.log("Sandbox 状态:", msg.data);
          break;
        case "sandbox-to-host":
          console.log("Sandbox 请求转发到 Host:", msg.data);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 验证文件
  const validateFile = (file: File): { valid: boolean; error?: string; suggestion?: string } => {
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      return {
        valid: false,
        error: "不支持的文件格式",
        suggestion: ERROR_SUGGESTIONS.format,
      };
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `文件大小超过限制（当前: ${(file.size / 1024 / 1024).toFixed(1)}MB）`,
        suggestion: ERROR_SUGGESTIONS.size,
      };
    }
    return { valid: true };
  };

  // 处理文件上传
  const handleFile = useCallback((file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setUploadState({
        status: "error",
        progress: 0,
        message: validation.error || "文件验证失败",
        suggestion: validation.suggestion,
      });
      return;
    }

    setUploadState({ status: "uploading", progress: 0, message: "正在处理图片..." });
    setFileName(file.name);

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        setUploadState({
          status: "uploading",
          progress,
          message: `正在读取图片... ${progress}%`,
        });
      }
    };

    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setImagePreview(imageData);
      lastImageDataRef.current = { data: imageData, name: file.name };
      setUploadState({ status: "success", progress: 100, message: "图片已准备就绪" });
    };

    reader.onerror = () => {
      setUploadState({
        status: "error",
        progress: 0,
        message: "读取文件失败",
        suggestion: ERROR_SUGGESTIONS.read,
      });
    };

    reader.readAsDataURL(file);
  }, []);

  // 处理粘贴图片
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    },
    [handleFile]
  );

  // 处理键盘快捷键
  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      // Escape - 取消
      if (e.key === "Escape") {
        e.preventDefault();
        parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
        return;
      }

      // Enter - 生成设计（当有图片且非处理中时）
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        if (imagePreview && uploadState.status !== "uploading") {
          e.preventDefault();
          handleGenerate();
          return;
        }
      }

      // Ctrl/Cmd + O - 打开文件选择
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }

      // Delete/Backspace - 清除图片
      if ((e.key === "Delete" || e.key === "Backspace") && imagePreview && !e.ctrlKey) {
        // 避免在输入框中触发
        if (document.activeElement?.tagName !== "INPUT") {
          e.preventDefault();
          handleClear();
          return;
        }
      }
    },
    [imagePreview, uploadState.status, handleGenerate, handleClear]
  );

  // 注册全局事件监听
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlePaste, handleKeyDown]);

  // 处理拖拽进入
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  // 处理拖拽悬停
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 处理拖拽放置
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  // 处理文件选择
  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  // 点击上传区域触发文件选择
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 生成设计
  const handleGenerate = useCallback(() => {
    if (!imagePreview) {
      setUploadState({
        status: "error",
        progress: 0,
        message: "请先上传图片",
        suggestion: "点击上传区域或拖拽图片到此处",
      });
      return;
    }

    setUploadState({ status: "uploading", progress: 0, message: "正在生成设计..." });

    parent.postMessage(
      {
        pluginMessage: {
          type: "upload-image",
          data: imagePreview,
          fileName: fileName,
        },
      },
      "*"
    );
  }, [imagePreview, fileName]);

  // 重试操作
  const handleRetry = useCallback(() => {
    if (retryCount >= 3) {
      setUploadState({
        status: "error",
        progress: 0,
        message: "重试次数已达上限",
        suggestion: "请尝试更换图片或刷新插件后重试",
      });
      return;
    }

    setRetryCount((prev) => prev + 1);

    if (lastImageDataRef.current) {
      setUploadState({ status: "uploading", progress: 0, message: "正在重新生成设计..." });
      parent.postMessage(
        {
          pluginMessage: {
            type: "upload-image",
            data: lastImageDataRef.current.data,
            fileName: lastImageDataRef.current.name,
          },
        },
        "*"
      );
    }
  }, [retryCount]);

  // 清除图片
  const handleClear = useCallback(() => {
    setImagePreview(null);
    setFileName("");
    setUploadState({ status: "idle", progress: 0, message: "" });
    setRetryCount(0);
    lastImageDataRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // 取消操作
  const handleCancel = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <div className="main-wrapper">
      <header className="header">
        <h1 className="title">Image to Pixso</h1>
        <p className="subtitle">上传截图，自动生成 Pixso 设计</p>
        <button
          className="guide-btn"
          onClick={showGuideAgain}
          title="显示操作指南"
          aria-label="显示操作指南"
        >
          ?
        </button>
      </header>

      {/* 操作引导 */}
      {showGuide && (
        <div className="guide-overlay" onClick={dismissGuide}>
          <div className="guide-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="guide-title">快速入门指南</h2>
            <div className="guide-section">
              <h3>📤 上传图片</h3>
              <ul>
                <li>
                  点击上传区域或<kbd>Ctrl</kbd>+<kbd>O</kbd>选择文件
                </li>
                <li>直接拖拽图片到上传区域</li>
                <li>
                  使用<kbd>Ctrl</kbd>+<kbd>V</kbd>粘贴剪贴板中的图片
                </li>
              </ul>
            </div>
            <div className="guide-section">
              <h3>⚡ 快捷键</h3>
              <ul>
                <li>
                  <kbd>Enter</kbd> - 生成设计
                </li>
                <li>
                  <kbd>Escape</kbd> - 关闭插件
                </li>
                <li>
                  <kbd>Delete</kbd> - 清除当前图片
                </li>
              </ul>
            </div>
            <div className="guide-section">
              <h3>💡 提示</h3>
              <ul>
                <li>支持 PNG、JPG、JPEG、WebP 格式</li>
                <li>图片大小限制 10MB</li>
                <li>清晰的截图能获得更好的识别效果</li>
              </ul>
            </div>
            <button className="guide-close-btn" onClick={dismissGuide}>
              开始使用
            </button>
          </div>
        </div>
      )}

      {/* 上传区域 */}
      <div
        className={`upload-zone ${isDragOver ? "drag-over" : ""} ${imagePreview ? "has-image" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={!imagePreview ? handleUploadClick : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            if (!imagePreview) {
              handleUploadClick();
            }
          }
        }}
        aria-label="上传图片区域"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_FORMATS.join(",")}
          onChange={handleFileChange}
          className="file-input"
          aria-hidden="true"
        />

        {imagePreview ? (
          <div className="preview-container">
            <img src={imagePreview} alt="预览图片" className="preview-image" />
            <div className="preview-overlay">
              <span className="file-name" title={fileName}>
                {fileName}
              </span>
              <button
                className="clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                title="清除图片 (Delete)"
                aria-label="清除图片"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">📷</div>
            <p className="upload-text">点击或拖拽图片到此处上传</p>
            <p className="upload-hint">支持 Ctrl+V 粘贴图片 | PNG, JPG, WebP | 最大 10MB</p>
          </div>
        )}
      </div>

      {/* 进度条和状态 */}
      {uploadState.status !== "idle" && (
        <div className={`status-bar ${uploadState.status}`} role="status" aria-live="polite">
          {uploadState.status === "uploading" && (
            <div className="progress-container">
              <div
                className="progress-bar"
                style={{ width: `${uploadState.progress}%` }}
                role="progressbar"
                aria-valuenow={uploadState.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}
          <div className="status-content">
            <span className="status-message">
              {uploadState.status === "uploading" && <span className="loading-spinner" />}
              {uploadState.status === "success" && (
                <span className="status-icon success-icon">✓</span>
              )}
              {uploadState.status === "error" && <span className="status-icon error-icon">✕</span>}
              {uploadState.message}
            </span>
            {uploadState.suggestion && uploadState.status === "error" && (
              <span className="status-suggestion">{uploadState.suggestion}</span>
            )}
          </div>
          {/* 重试按钮 */}
          {uploadState.status === "error" && lastImageDataRef.current && retryCount < 3 && (
            <button className="retry-btn" onClick={handleRetry} title="重试">
              🔄 重试 ({3 - retryCount})
            </button>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={!imagePreview || uploadState.status === "uploading"}
          title="生成设计 (Enter)"
        >
          {uploadState.status === "uploading" ? "处理中..." : "生成设计"}
        </button>
        <button className="btn btn-secondary" onClick={handleCancel} title="取消 (Escape)">
          取消
        </button>
      </div>

      {/* 快捷键提示 */}
      <div className="shortcuts-hint">
        <span>
          <kbd>Enter</kbd> 生成
        </span>
        <span>
          <kbd>Esc</kbd> 取消
        </span>
        <span>
          <kbd>Ctrl+V</kbd> 粘贴
        </span>
      </div>
    </div>
  );
};

export default App;
