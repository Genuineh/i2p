pixso.showUI(__html__);

pixso.ui.onmessage = (msg) => {
  if (msg.type === "create-rectangles") {
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
