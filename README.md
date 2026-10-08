# 长三角三省一市行政区划与道路网地图

一个基于 Leaflet 的网页地图，以江苏、浙江、安徽、上海（长三角三省一市）行政区划为底图，支持鼠标缩放，最细展示到**县/区级**边界；并叠加**国道（G）/省道（S）**路网。

## 在线运行

用浏览器直接打开 `index.html` 即可。页面会尝试按以下优先级加载数据：

1. 本地 `data/boundaries_county.json` 与 `data/roads_gs.json`（如果你有预下载）
2. 在线来源：
   - 行政区划：`https://geo.datav.aliyun.com/areas_v3/bound/...`
   - 道路网：`https://overpass-api.de/api/interpreter`（OpenStreetMap）

## 本地预处理（可选）

如果你希望生成可离线使用的数据包，或在线加载较慢，可在有网络环境的机器上运行：

```bash
cd delta-map
python fetch_boundaries.py
python fetch_roads.py
```

生成的文件：

- `data/boundaries_county.json` — 三省一市县/区级边界
- `data/roads_gs.json` — 区域内国道/省道路网

然后再打开 `index.html`，地图会优先读取本地文件。

## 使用说明

- **缩放/平移**：鼠标滚轮缩放，拖拽平移；缩放级别最高到 14 级。
- **边界样式**：省界为加粗深蓝线；县/区界为浅灰细线。
- **道路网**：点击“加载道路网”按钮后，地图会叠加红色国道（G）和橙色省道（S）。
- **信息弹窗**：点击任意行政区划或道路，可查看名称、代码、所属层级、道路编号等。
- **图层控制**：右上角可开关省界、县/区界、国道、省道。

## 数据来源

- 行政区划：[阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector.html)
- 道路数据：[OpenStreetMap](https://www.openstreetmap.org/) via [Overpass API](https://overpass-api.de/)
- 底图：[CARTO light_all](https://carto.com/basemaps/)（基于 OpenStreetMap）

## 常见问题

**行政区划加载失败？**

- 确认浏览器能访问 `geo.datav.aliyun.com`。
- 如在公司内网，可能需要配置代理或白名单。

**道路网加载失败？**

- Overpass API 为公开服务，偶有超时；可点击“重试道路网”。
- 若长期无法访问，可在其他网络环境运行 `fetch_roads.py` 生成本地数据。
