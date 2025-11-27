import * as React from "react";
import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";
import "./app.css";

// 支持的图片格式
const SUPPORTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

// 上传状态类型
type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  message: string;
}

const App = () => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 验证文件
  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      return `不支持的文件格式。请上传 PNG, JPG, JPEG 或 WebP 格式的图片。`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件大小超过限制。最大支持 ${MAX_FILE_SIZE_MB}MB。`;
    }
    return null;
  };

  // 处理文件上传
  const handleFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadState({ status: "error", progress: 0, message: error });
      return;
    }

    setUploadState({ status: "uploading", progress: 0, message: "正在处理图片..." });
    setFileName(file.name);

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        setUploadState({ status: "uploading", progress, message: `正在读取图片... ${progress}%` });
      }
    };

    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setImagePreview(imageData);
      setUploadState({ status: "success", progress: 100, message: "图片已准备就绪" });
    };

    reader.onerror = () => {
      setUploadState({ status: "error", progress: 0, message: "读取文件失败，请重试" });
    };

    reader.readAsDataURL(file);
  }, []);

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
  const handleGenerate = () => {
    if (!imagePreview) {
      setUploadState({ status: "error", progress: 0, message: "请先上传图片" });
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
  };

  // 清除图片
  const handleClear = () => {
    setImagePreview(null);
    setFileName("");
    setUploadState({ status: "idle", progress: 0, message: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 取消操作
  const handleCancel = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  return (
    <div className="main-wrapper">
      <header className="header">
        <h1 className="title">Image to Pixso</h1>
        <p className="subtitle">上传截图，自动生成 Pixso 设计</p>
      </header>

      {/* 上传区域 */}
      <div
        className={`upload-zone ${isDragOver ? "drag-over" : ""} ${imagePreview ? "has-image" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={!imagePreview ? handleUploadClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_FORMATS.join(",")}
          onChange={handleFileChange}
          className="file-input"
        />

        {imagePreview ? (
          <div className="preview-container">
            <img src={imagePreview} alt="Preview" className="preview-image" />
            <div className="preview-overlay">
              <span className="file-name">{fileName}</span>
              <button className="clear-btn" onClick={handleClear} title="清除图片">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">📷</div>
            <p className="upload-text">点击或拖拽图片到此处上传</p>
            <p className="upload-hint">支持 PNG, JPG, JPEG, WebP 格式，最大 10MB</p>
          </div>
        )}
      </div>

      {/* 进度条和状态 */}
      {uploadState.status !== "idle" && (
        <div className={`status-bar ${uploadState.status}`}>
          {uploadState.status === "uploading" && (
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${uploadState.progress}%` }} />
            </div>
          )}
          <span className="status-message">
            {uploadState.status === "uploading" && <span className="loading-spinner" />}
            {uploadState.status === "success" && <span className="status-icon">✓</span>}
            {uploadState.status === "error" && <span className="status-icon">✕</span>}
            {uploadState.message}
          </span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={!imagePreview || uploadState.status === "uploading"}
        >
          {uploadState.status === "uploading" ? "处理中..." : "生成设计"}
        </button>
        <button className="btn btn-secondary" onClick={handleCancel}>
          取消
        </button>
      </div>
    </div>
  );
};

export default App;
