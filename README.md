# 太鼓达人难度计算器 (Taiko Rating Calculator)

基于 Vite + Pyodide 的纯 Web 应用，在浏览器中实时计算太鼓达人谱面的体力、复合、节奏、爆发定数。

## 快速开始

```bash
npm install
npm run dev
```

默认开发地址为 http://localhost:5173/。

## 构建

```bash
npm run build
```

构建输出目录：`dist/`，可直接部署到任何静态托管服务。

## 使用方法

将包含谱面 JSON 的数据文件夹拖入页面的表格区域，应用会自动读取并计算定数。

## 项目结构

```
src/
  index.html        主界面
  main.js           应用逻辑（拖拽导入、排序、搜索、导出）
  data-engine.js    Pyodide 生命周期管理与计算调度
public/
  体力.py           体力定数算法
  复合.py           复合定数算法
  节奏.py           节奏定数算法
  爆发.py           爆发定数算法
  calculator.py     批量计算入口（calculate_batch）
data/               原始谱面 JSON 数据
```

## 计算说明

| 列 | 说明 |
|----|------|
| 体力 | 连续高密度段落的累积消耗 |
| 复合 | 复杂鱼蛋的换手难度 |
| 复合难占比 | 复合难点占整体的比例 |
| 节奏 | 间隔变化的不规则程度 |
| 节奏难占比 | 节奏难点占整体的比例 |
| 爆发 | 高 BPM 段落的加权平均难度 |

## 开发注意

- 直接编辑 `public/*.py`，无需额外同步步骤。
- Python 模块在浏览器中由 [Pyodide v0.24.1](https://pyodide.org/) 执行，无需本地 Python 环境。

## 部署

构建后将 `dist/` 目录上传到静态托管即可（GitHub Pages、Vercel、Cloudflare Pages 等均支持）。
