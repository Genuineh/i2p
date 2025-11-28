/**
 * 布局分析器
 * 分析元素的布局结构，生成响应式约束
 */

import {
  RecognizedElement,
  LayoutStructure,
  LayoutRow,
  LayoutColumn,
  GridInfo,
  LayoutInfo,
  ConstraintType,
} from "./types";

/**
 * 布局分析配置
 */
interface LayoutAnalyzerConfig {
  alignmentThreshold?: number; // 对齐容差
  gapThreshold?: number; // 间距检测容差
  minGroupSize?: number; // 最小分组大小
}

/**
 * 元素边界信息
 */
interface ElementBounds {
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/**
 * 布局分析器
 */
export class LayoutAnalyzer {
  private config: Required<LayoutAnalyzerConfig>;

  constructor(config: LayoutAnalyzerConfig = {}) {
    this.config = {
      alignmentThreshold: config.alignmentThreshold ?? 5,
      gapThreshold: config.gapThreshold ?? 10,
      minGroupSize: config.minGroupSize ?? 2,
    };
  }

  /**
   * 分析布局结构
   */
  analyzeStructure(
    elements: RecognizedElement[],
    _containerWidth: number,
    _containerHeight: number
  ): LayoutStructure {
    if (elements.length === 0) {
      return { rows: [], columns: [] };
    }

    const bounds = this.calculateBounds(elements);
    const rows = this.detectRows(bounds);
    const columns = this.detectColumns(bounds);
    const gridInfo = this.detectGrid(elements, rows, columns);

    return { rows, columns, gridInfo };
  }

  /**
   * 为元素生成布局约束
   */
  generateConstraints(
    element: RecognizedElement,
    containerWidth: number,
    containerHeight: number,
    _layoutStructure?: LayoutStructure
  ): LayoutInfo {
    const horizontalConstraint = this.inferHorizontalConstraint(element, containerWidth);
    const verticalConstraint = this.inferVerticalConstraint(element, containerHeight);

    return {
      constraints: {
        horizontal: horizontalConstraint,
        vertical: verticalConstraint,
      },
    };
  }

  /**
   * 自动生成所有元素的布局约束
   */
  generateAllConstraints(
    elements: RecognizedElement[],
    containerWidth: number,
    containerHeight: number
  ): RecognizedElement[] {
    const layoutStructure = this.analyzeStructure(elements, containerWidth, containerHeight);

    return elements.map((element) => {
      const layout = this.generateConstraints(
        element,
        containerWidth,
        containerHeight,
        layoutStructure
      );
      return {
        ...element,
        layout: {
          ...element.layout,
          ...layout,
        },
      };
    });
  }

  /**
   * 分析并保持元素间距
   */
  analyzeSpacing(elements: RecognizedElement[]): { horizontalGaps: number[]; verticalGaps: number[] } {
    if (elements.length < 2) {
      return { horizontalGaps: [], verticalGaps: [] };
    }

    const bounds = this.calculateBounds(elements);
    const horizontalGaps: number[] = [];
    const verticalGaps: number[] = [];

    // 按x坐标排序找水平间距
    const sortedByX = [...bounds].sort((a, b) => a.left - b.left);
    for (let i = 0; i < sortedByX.length - 1; i++) {
      const gap = sortedByX[i + 1].left - sortedByX[i].right;
      if (gap > 0) {
        horizontalGaps.push(gap);
      }
    }

    // 按y坐标排序找垂直间距
    const sortedByY = [...bounds].sort((a, b) => a.top - b.top);
    for (let i = 0; i < sortedByY.length - 1; i++) {
      const gap = sortedByY[i + 1].top - sortedByY[i].bottom;
      if (gap > 0) {
        verticalGaps.push(gap);
      }
    }

    return { horizontalGaps, verticalGaps };
  }

  /**
   * 检测对齐关系
   */
  detectAlignment(elements: RecognizedElement[]): {
    leftAligned: number[][];
    rightAligned: number[][];
    topAligned: number[][];
    bottomAligned: number[][];
    centerXAligned: number[][];
    centerYAligned: number[][];
  } {
    const bounds = this.calculateBounds(elements);
    const threshold = this.config.alignmentThreshold;

    return {
      leftAligned: this.groupByValue(bounds, (b) => b.left, threshold),
      rightAligned: this.groupByValue(bounds, (b) => b.right, threshold),
      topAligned: this.groupByValue(bounds, (b) => b.top, threshold),
      bottomAligned: this.groupByValue(bounds, (b) => b.bottom, threshold),
      centerXAligned: this.groupByValue(bounds, (b) => b.centerX, threshold),
      centerYAligned: this.groupByValue(bounds, (b) => b.centerY, threshold),
    };
  }

  /**
   * 计算元素边界
   */
  private calculateBounds(elements: RecognizedElement[]): ElementBounds[] {
    return elements.map((element, index) => ({
      index,
      left: element.x,
      top: element.y,
      right: element.x + element.width,
      bottom: element.y + element.height,
      centerX: element.x + element.width / 2,
      centerY: element.y + element.height / 2,
    }));
  }

  /**
   * 检测行布局
   */
  private detectRows(bounds: ElementBounds[]): LayoutRow[] {
    const threshold = this.config.alignmentThreshold;
    const groups = this.groupByValue(bounds, (b) => b.centerY, threshold * 2);

    return groups
      .filter((group) => group.length >= this.config.minGroupSize)
      .map((group) => {
        const elements = group.map((idx) => bounds[idx]);
        const minY = Math.min(...elements.map((e) => e.top));
        const maxY = Math.max(...elements.map((e) => e.bottom));

        return {
          y: minY,
          height: maxY - minY,
          elements: group,
        };
      });
  }

  /**
   * 检测列布局
   */
  private detectColumns(bounds: ElementBounds[]): LayoutColumn[] {
    const threshold = this.config.alignmentThreshold;
    const groups = this.groupByValue(bounds, (b) => b.centerX, threshold * 2);

    return groups
      .filter((group) => group.length >= this.config.minGroupSize)
      .map((group) => {
        const elements = group.map((idx) => bounds[idx]);
        const minX = Math.min(...elements.map((e) => e.left));
        const maxX = Math.max(...elements.map((e) => e.right));

        return {
          x: minX,
          width: maxX - minX,
          elements: group,
        };
      });
  }

  /**
   * 检测网格结构
   */
  private detectGrid(
    elements: RecognizedElement[],
    rows: LayoutRow[],
    columns: LayoutColumn[]
  ): GridInfo | undefined {
    if (rows.length < 2 && columns.length < 2) {
      return undefined;
    }

    // 计算行间距
    let rowGap = 0;
    if (rows.length >= 2) {
      const rowGaps: number[] = [];
      const sortedRows = [...rows].sort((a, b) => a.y - b.y);
      for (let i = 0; i < sortedRows.length - 1; i++) {
        const gap = sortedRows[i + 1].y - (sortedRows[i].y + sortedRows[i].height);
        if (gap > 0) {
          rowGaps.push(gap);
        }
      }
      if (rowGaps.length > 0) {
        rowGap = this.getMostCommonValue(rowGaps);
      }
    }

    // 计算列间距
    let columnGap = 0;
    if (columns.length >= 2) {
      const columnGaps: number[] = [];
      const sortedColumns = [...columns].sort((a, b) => a.x - b.x);
      for (let i = 0; i < sortedColumns.length - 1; i++) {
        const gap = sortedColumns[i + 1].x - (sortedColumns[i].x + sortedColumns[i].width);
        if (gap > 0) {
          columnGaps.push(gap);
        }
      }
      if (columnGaps.length > 0) {
        columnGap = this.getMostCommonValue(columnGaps);
      }
    }

    return {
      columnCount: columns.length,
      rowCount: rows.length,
      columnGap,
      rowGap,
    };
  }

  /**
   * 推断水平约束
   */
  private inferHorizontalConstraint(
    element: RecognizedElement,
    containerWidth: number
  ): ConstraintType {
    const leftDistance = element.x;
    const rightDistance = containerWidth - (element.x + element.width);
    const threshold = containerWidth * 0.1;

    // 如果元素宽度接近容器宽度，使用拉伸
    if (element.width > containerWidth * 0.8) {
      return "stretch";
    }

    // 如果左右距离相近，居中
    if (Math.abs(leftDistance - rightDistance) < threshold) {
      return "center";
    }

    // 如果靠近左边
    if (leftDistance < rightDistance && leftDistance < threshold) {
      return "min";
    }

    // 如果靠近右边
    if (rightDistance < leftDistance && rightDistance < threshold) {
      return "max";
    }

    // 默认保持缩放
    return "scale";
  }

  /**
   * 推断垂直约束
   */
  private inferVerticalConstraint(
    element: RecognizedElement,
    containerHeight: number
  ): ConstraintType {
    const topDistance = element.y;
    const bottomDistance = containerHeight - (element.y + element.height);
    const threshold = containerHeight * 0.1;

    // 如果元素高度接近容器高度，使用拉伸
    if (element.height > containerHeight * 0.8) {
      return "stretch";
    }

    // 如果上下距离相近，居中
    if (Math.abs(topDistance - bottomDistance) < threshold) {
      return "center";
    }

    // 如果靠近顶部
    if (topDistance < bottomDistance && topDistance < threshold) {
      return "min";
    }

    // 如果靠近底部
    if (bottomDistance < topDistance && bottomDistance < threshold) {
      return "max";
    }

    // 默认保持缩放
    return "scale";
  }

  /**
   * 按值分组
   */
  private groupByValue(
    bounds: ElementBounds[],
    getValue: (b: ElementBounds) => number,
    threshold: number
  ): number[][] {
    const sorted = [...bounds].sort((a, b) => getValue(a) - getValue(b));
    const groups: number[][] = [];
    let currentGroup: number[] = [];
    let lastValue = -Infinity;

    for (const bound of sorted) {
      const value = getValue(bound);
      if (value - lastValue > threshold && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(bound.index);
      lastValue = value;
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 获取数组中最常见的值（使用四舍五入后分组）
   */
  private getMostCommonValue(values: number[]): number {
    const rounded = values.map((v) => Math.round(v));
    const counts = new Map<number, number>();

    for (const v of rounded) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommon = 0;

    for (const [value, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = value;
      }
    }

    return mostCommon;
  }
}
