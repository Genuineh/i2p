/**
 * 图片处理工具函数
 * 提供图片压缩、格式转换等功能
 */

/**
 * 图片压缩选项
 */
export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputFormat?: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  data: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

/**
 * 压缩图片
 * @param imageData - Base64 编码的图片数据
 * @param options - 压缩选项
 * @returns 压缩后的图片数据
 */
export async function compressImage(
  imageData: string,
  options: ImageCompressionOptions = {}
): Promise<CompressionResult> {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.8, outputFormat = "image/jpeg" } = options;

  // 计算原始大小
  const originalSize = Math.round((imageData.length * 3) / 4);

  // 加载图片
  const img = await loadImage(imageData);
  const originalWidth = img.width;
  const originalHeight = img.height;

  // 计算新尺寸
  let newWidth = originalWidth;
  let newHeight = originalHeight;

  if (originalWidth > maxWidth || originalHeight > maxHeight) {
    const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
    newWidth = Math.round(originalWidth * ratio);
    newHeight = Math.round(originalHeight * ratio);
  }

  // 创建 Canvas 并绘制
  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("无法创建 Canvas 上下文");
  }

  // 使用高质量缩放
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  // 导出压缩后的图片
  const compressedData = canvas.toDataURL(outputFormat, quality);
  const compressedSize = Math.round((compressedData.length * 3) / 4);

  return {
    data: compressedData,
    originalSize,
    compressedSize,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * 加载图片
 */
function loadImage(imageData: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageData;
  });
}

/**
 * 获取图片尺寸
 * @param imageData - Base64 编码的图片数据
 * @returns 图片宽度和高度
 */
export async function getImageDimensions(
  imageData: string
): Promise<{ width: number; height: number }> {
  const img = await loadImage(imageData);
  return { width: img.width, height: img.height };
}

/**
 * 验证图片数据是否有效
 * @param imageData - Base64 编码的图片数据
 * @returns 是否有效
 */
export function isValidImageData(imageData: string): boolean {
  const validPrefixes = [
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/webp;base64,",
  ];

  return validPrefixes.some((prefix) => imageData.startsWith(prefix));
}

/**
 * 从 Base64 数据中获取图片格式
 * @param imageData - Base64 编码的图片数据
 * @returns 图片格式
 */
export function getImageFormat(imageData: string): string | null {
  const match = imageData.match(/^data:image\/(\w+);base64,/);
  return match ? match[1] : null;
}
