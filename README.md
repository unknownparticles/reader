# 多源聚合阅读器

一个基于 React + Vite + Express 的本地聚合阅读器，支持导入第三方书源，在同一个界面里搜索、查看详情、阅读小说、浏览漫画。

项目当前的重点不是“内置固定站点”，而是“尽量兼容规则驱动的第三方源”。应用会在本地启动一个代理服务，用来处理跨域、图片防盗链、部分请求头和 POST 请求等问题。

## 当前能力

- 导入第三方书源
  - 支持直接导入 JSON
  - 支持部分仓库入口和聚合入口自动跳转到真实源文件
  - 已兼容部分常见来源，例如 XIU2、AOAOSTAR、漫画大全一类入口
- 多类型内容聚合
  - 小说
  - 漫画
  - 预留了音频、视频、直播类型
- 基础阅读链路
  - 搜索
  - 推荐
  - 详情
  - 目录
  - 小说正文阅读
  - 漫画图片阅读
- 本地代理能力
  - 文本代理 `/api/proxy`
  - 图片代理 `/api/image`
  - 支持自定义 `method / headers / body / referer / contentType`
- 阅读体验
  - 小说阅读主题、字号、行高调整
  - 段首两字符缩进
  - 自动滚动
  - 上一章 / 下一章
  - 左右方向键翻章
  - 漫画上一话 / 下一话
- 本地缓存
  - 书源缓存
  - 推荐页缓存
  - 搜索结果缓存
  - 最近阅读项和章节缓存

## 技术栈

- React 19
- React Router 7
- Vite
- TypeScript
- Express
- Axios
- Tailwind CSS

## 目录说明

```text
src/
  pages/                页面
  services/             书源导入、解析、阅读状态、代理地址转换等核心逻辑
  components/           通用组件
  types.ts              类型定义
server.ts               本地开发服务器和代理服务
```

核心文件说明：

- `server.ts`
  - 启动本地开发服务
  - 代理第三方页面、接口和图片
- `src/services/importService.ts`
  - 导入和转换第三方书源
- `src/services/parserService.ts`
  - 搜索、详情、目录、正文、漫画图片解析
- `src/services/sourceService.ts`
  - 本地书源存储与清洗

## 本地运行

### 环境要求

- Node.js 18 或更高版本

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

说明：

- 这个项目开发时不是直接跑 Vite 默认端口，而是通过 `server.ts` 启动
- `3000` 端口同时承担页面访问和代理请求
- 线上静态部署时，可通过 `VITE_PROXY_BASE_URL` 指向外部代理服务

### 代理环境变量

如果你使用外部代理服务，例如 Cloudflare Worker，可配置：

```bash
VITE_PROXY_BASE_URL=https://reader.aliveservice.asia/api/proxy
```

本地开发如果不配置，默认仍然走：

```text
/api/proxy
```

### 运行类型检查

```bash
npm run lint
```

## 使用方式

### 1. 导入书源

进入设置页后，导入以下任意形式：

- 原始 JSON 内容
- 直链 URL
- 部分仓库入口 URL

### 2. 搜索内容

- 首页点“小说”会进入小说搜索标签，并优先只搜索书源
- 点“漫画”会进入漫画搜索标签，并优先只搜索漫画源

### 3. 阅读

- 小说会进入阅读页
- 漫画会进入漫画图片页

## 解析策略说明

由于第三方源格式不统一，项目当前采用“规则优先，兜底补齐”的思路：

- 优先按源规则解析
- 如果规则不完整，会尝试从常见 HTML / JSON 结构里兜底
- 对部分明显误判的结果，会根据详情链接再次纠正类型
  - 例如 `/comic/...` 强制视为漫画
- 对漫画正文，会优先从常见 JSON 图片数组字段兜底提取
  - 例如 `chapter_img_list`

## 当前限制

这个项目已经能覆盖一部分常见源，但还没有完整实现 Legado 的全部规则语法。当前已知限制包括：

- 不是所有第三方书源都能 100% 兼容
- 某些源依赖复杂 JavaScript 上下文，仍可能解析失败
- 部分站点存在 Cloudflare、频率限制、Referer 校验、签名图片地址等问题
- 漫画和小说源格式差异很大，个别源仍需要定向适配

如果遇到问题，优先看控制台和终端日志。项目里已经在关键链路加了较详细的诊断输出，方便按真实返回值继续修。

## 开发建议

- 新增规则兼容时，优先改 `src/services/parserService.ts`
- 新增导入入口时，优先改 `src/services/importService.ts`
- 如果是跨域、图片、防盗链问题，优先看 `server.ts`

## License

当前仓库未单独声明许可证。如需开源发布，建议补充明确的 LICENSE 文件。
