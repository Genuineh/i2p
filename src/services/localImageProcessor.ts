/**
 * 本地图像处理服务
 * 使用 Canvas API 进行基础的颜色和区域分析
 */

import {
  IImageRecognitionService,
  ImageAnalysisResult,
  RecognizedElement,
  ColorInfo,
} from "./types";

/**
 * 本地图像处理配置
 */
interface LocalProcessorConfig {
  colorThreshold?: number;
  minRegionSize?: number;
  maxRegions?: number;
}

/**
 * 区域信息
 */
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  color: ColorInfo;
  pixelCount: number;
}

/**
 * 本地图像处理服务
 * 默认的图像分析方案，使用 Canvas 进行颜色和区域分析
 */
export class LocalImageProcessor implements IImageRecognitionService {
  private config: Required<LocalProcessorConfig>;

  constructor(config: LocalProcessorConfig = {}) {
    this.config = {
      colorThreshold: config.colorThreshold ?? 30,
      minRegionSize: config.minRegionSize ?? 20,
      maxRegions: config.maxRegions ?? 50,
    };
  }

  getName(): string {
    return "LocalImageProcessor";
  }

  async isAvailable(): Promise<boolean> {
    // Canvas API 在浏览器环境中始终可用
    return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
  }

  async analyze(imageData: string): Promise<ImageAnalysisResult> {
    try {
      // 加载图片
      const img = await this.loadImage(imageData);
      const width = img.width;
      const height = img.height;

      // 创建 Canvas 并绘制图片
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      ctx.drawImage(img, 0, 0);
      const imageDataObj = ctx.getImageData(0, 0, width, height);

      // 分析图片
      const dominantColors = this.extractDominantColors(imageDataObj);
      const regions = this.detectRegions(imageDataObj);
      const elements = this.convertRegionsToElements(regions);

      return {
        width,
        height,
        elements,
        dominantColors,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      return {
        width: 0,
        height: 0,
        elements: [],
        success: false,
        error: `本地图像处理失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 加载图片
   */
  private loadImage(imageData: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = imageData;
    });
  }

  /**
   * 提取主要颜色
   */
  private extractDominantColors(imageData: ImageData): ColorInfo[] {
    const colorMap = new Map<string, { color: ColorInfo; count: number }>();
    const data = imageData.data;
    // 自适应采样步长：根据图片大小动态调整
    const totalPixels = imageData.width * imageData.height;
    const step = Math.max(4, Math.floor(totalPixels / 100000));

    for (let i = 0; i < data.length; i += 4 * step) {
      // 量化颜色以减少颜色数量
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;

      const existing = colorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        colorMap.set(key, {
          color: { r: r / 255, g: g / 255, b: b / 255 },
          count: 1,
        });
      }
    }

    // 按出现次数排序，取前 5 个主要颜色
    return Array.from(colorMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((item) => item.color);
  }

  /**
   * 检测颜色区域
   * 使用简化的区域检测算法
   */
  private detectRegions(imageData: ImageData): Region[] {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const regions: Region[] = [];

    // 使用网格划分进行区域检测
    const gridSize = Math.max(20, Math.min(width, height) / 20);
    const visited = new Set<string>();

    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        const key = `${Math.floor(x / gridSize)},${Math.floor(y / gridSize)}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const region = this.findRegion(data, width, height, x, y, gridSize);
        if (region && region.pixelCount >= this.config.minRegionSize) {
          regions.push(region);
        }

        if (regions.length >= this.config.maxRegions) {
          break;
        }
      }
      if (regions.length >= this.config.maxRegions) {
        break;
      }
    }

    // 合并相似的相邻区域
    return this.mergeRegions(regions);
  }

  /**
   * 查找一个区域
   */
  private findRegion(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    startX: number,
    startY: number,
    gridSize: number
  ): Region | null {
    const endX = Math.min(startX + gridSize, width);
    const endY = Math.min(startY + gridSize, height);

    let totalR = 0,
      totalG = 0,
      totalB = 0;
    let count = 0;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * 4;
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }

    if (count === 0) return null;

    return {
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY,
      color: {
        r: totalR / count / 255,
        g: totalG / count / 255,
        b: totalB / count / 255,
      },
      pixelCount: count,
    };
  }

  /**
   * 合并相似区域
   */
  private mergeRegions(regions: Region[]): Region[] {
    if (regions.length <= 1) return regions;

    const merged: Region[] = [];
    const used = new Set<number>();

    for (let i = 0; i < regions.length; i++) {
      if (used.has(i)) continue;

      let current = { ...regions[i] };
      used.add(i);

      // 查找可合并的相邻区域
      for (let j = i + 1; j < regions.length; j++) {
        if (used.has(j)) continue;

        const other = regions[j];
        if (this.shouldMerge(current, other)) {
          current = this.mergeTwo(current, other);
          used.add(j);
        }
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * 判断两个区域是否应该合并
   */
  private shouldMerge(a: Region, b: Region): boolean {
    // 检查颜色相似性
    const colorDiff =
      Math.abs(a.color.r - b.color.r) * 255 +
      Math.abs(a.color.g - b.color.g) * 255 +
      Math.abs(a.color.b - b.color.b) * 255;

    if (colorDiff > this.config.colorThreshold * 3) return false;

    // 检查空间相邻性
    const gap = 5;
    const adjacentX = Math.abs(a.x + a.width - b.x) <= gap || Math.abs(b.x + b.width - a.x) <= gap;
    const adjacentY =
      Math.abs(a.y + a.height - b.y) <= gap || Math.abs(b.y + b.height - a.y) <= gap;
    const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
    const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;

    return (adjacentX && overlapY) || (adjacentY && overlapX);
  }

  /**
   * 合并两个区域
   */
  private mergeTwo(a: Region, b: Region): Region {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);

    const totalPixels = a.pixelCount + b.pixelCount;

    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
      color: {
        r: (a.color.r * a.pixelCount + b.color.r * b.pixelCount) / totalPixels,
        g: (a.color.g * a.pixelCount + b.color.g * b.pixelCount) / totalPixels,
        b: (a.color.b * a.pixelCount + b.color.b * b.pixelCount) / totalPixels,
      },
      pixelCount: totalPixels,
    };
  }

  /**
   * 将区域转换为设计元素
   */
  private convertRegionsToElements(regions: Region[]): RecognizedElement[] {
    return regions.map((region) => ({
      type: "rectangle" as const,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      color: region.color,
    }));
  }
}
