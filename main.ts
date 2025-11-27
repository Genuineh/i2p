pixso.showUI(__html__, { width: 400, height: 520 });

pixso.ui.onmessage = (msg) => {
  if (msg.type === "upload-image") {
    // 处理图片上传
    const _imageData = msg.data; // 保留以供阶段二使用
    const fileName = msg.fileName;

    console.log("Received image:", fileName);

    // TODO: 阶段二将实现图片识别和分析
    // TODO: 阶段三将实现 Pixso 元素生成

    // 暂时创建一个占位符矩形表示图片已接收
    const rect = pixso.createRectangle();
    rect.name = fileName || "Uploaded Image";
    rect.x = 0;
    rect.y = 0;
    rect.resize(400, 300);
    rect.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
    pixso.currentPage.appendChild(rect);
    pixso.currentPage.selection = [rect];
    pixso.viewport.scrollAndZoomIntoView([rect]);

    // 通知 UI 处理完成
    pixso.ui.postMessage({ type: "complete", message: "设计生成完成" });
    pixso.closePlugin();
  } else if (msg.type === "create-rectangles") {
    // 保留原有功能以便兼容
    const nodes: SceneNode[] = [];
    for (let i = 0; i < msg.count; i++) {
      const rect = pixso.createRectangle();
      rect.x = i * 150;
      rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }];
      pixso.currentPage.appendChild(rect);
      nodes.push(rect);
    }
    pixso.currentPage.selection = nodes;
    pixso.viewport.scrollAndZoomIntoView(nodes);
    pixso.closePlugin();
  } else if (msg.type === "cancel") {
    pixso.closePlugin();
  }
};
