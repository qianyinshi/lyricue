# Lyricue

可嵌入页面、弹窗或侧栏的歌词打轴 **Web Component**。运行时和 peer dependencies 均为零；不依赖 React、Vue、Semi UI、Router 或业务 API。

> MIT 开源。npm 包尚未发布；`private: true` 暂时保留以防误发布。

[在线演示](https://qianyinshi.github.io/lyricue/) · [English](README.md)

## 能力

- 浏览器读取音频生成真实波形，缩放、横向滚动、播放游标与自动跟随。
- 点按／长按打轴，暂停续打、重打上一句及可点击的快捷键键帽。
- 歌词边界单侧／双侧调整、片段与边界短试听、撤销／重做。
- L 时间标记、方向键定位及自动滚动的歌词预览。
- LRC 解析／导出，包括重复标签、offset、显式句尾与间奏留白。
- Shadow DOM 隔离样式；CSS 变量继承宿主主题。
- 独立 `/core` 纯算法入口，无需 DOM，可用于 Node.js 和自定义 UI。

## 安装与使用

在本仓库根目录：

```sh
npm install
npm run verify:package
npm pack
```

在其他项目中安装生成的 `.tgz`：

```sh
npm install /path/to/lyricue-0.1.0.tgz
```

```ts
import { defineLyricsEditor } from 'lyricue';

defineLyricsEditor(); // 幂等，只需注册一次
const editor = document.createElement('lyrics-editor');
editor.load({
  audioSrc: '/song.mp3',
  lyrics: '第一句歌词\n第二句歌词',
  mode: 'tap',
});
editor.addEventListener('lyrics-save', event => {
  console.log(event.detail.lyrics);   // LRC 字符串
  console.log(event.detail.document); // 整数毫秒的独立文档快照
});
document.querySelector('#container')!.append(editor);
```

无需另外导入 CSS。第一版 UI 为简体中文。需要支持 Custom Elements、Shadow DOM、Web Audio、Pointer Events、ResizeObserver 与 AbortSignal 事件监听的现代浏览器。

也可以自动注册：

```ts
import 'lyricue/register';
```

### 原生 HTML，无需构建工具

将 `.tgz` 中整个 `dist/` 目录放在静态服务器的 `/vendor/lyrics-editor/` 下，保持文件间的相对路径：

```html
<lyrics-editor
  audio-src="/song.mp3"
  lyrics="第一句歌词&#10;第二句歌词"
  mode="tap"
></lyrics-editor>
<script type="module" src="/vendor/lyrics-editor/register.js"></script>
```

用 HTTP 服务访问页面。所有 JS 模块和组件样式都随 `dist/` 提供，不需要 CDN 框架或额外运行时。

## 会话与属性

`load(options)` 替换整个会话，重置播放位置、撤销历史和临时标记。完整带时间的 LRC 直接进入精调；普通／混合歌词进入粗打，完成后点击“开始精调”。

| JS 属性／选项 | HTML 属性 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `audioSrc` | `audio-src` | `''` | 同源、允许 CORS 的远端／签名 URL 或 Blob URL |
| `lyrics` | `lyrics` | `''` | 初始字符串或 `LyricDocument`；HTML 属性仅接受字符串 |
| `mode` | `mode` | `'tap'` | `'tap'`／`'hold'`；会话内 UI 不切换模式 |
| `saveLabel` | `save-label` | `'保存歌词'` | 保存按钮文字 |
| `showSave` | `hide-save`（反向） | `true` | 是否显示保存按钮 |
| `keyboardEnabled` | `keyboard-disabled`（反向） | `true` | 启停快捷键、键帽键盘激活和边界键盘编辑 |
| `preventUnload` | `no-unload-guard`（反向） | `true` | 有修改时提示关闭页面 |
| `autoFocus`（仅 load 选项） | `autofocus` | `false` | 会话挂载时聚焦编辑器 |

单独修改 `audioSrc`、`lyrics` 或 `mode` 也会重建会话；批量变更优先用一次 `load()`。其他属性可即时更新且保留草稿。HTML 布尔属性按**是否存在**判断，`keyboard-disabled="false"` 仍会禁用；启用时移除该属性。

加载、注册可异步完成；组件保留注册前赋予的 JS 属性。初始化会在下一个 microtask 完成，初始通知也异步发出，请先绑定事件再 `load()`／挂载。

组件从 DOM 移除时暂停音频、结束当前句、取消波形请求、移除全局监听和观察器；重新插入同一元素保留草稿、历史与标记，保持暂停。同步移动元素到另一个容器会保留会话。显式 `load()` 开始新会话。

## 事件与方法

事件使用 `CustomEvent`，均 `bubbles: true`、`composed: true`，可在组件或外层容器监听。

| 事件 | `event.detail` |
| --- | --- |
| `lyrics-save` | `{ lyrics: string, document: LyricDocument }` |
| `lyrics-change` | `LyricDocument`，初始／已提交内容变化；不会逐播放帧发出 |
| `lyrics-dirty-change` | `{ dirty: boolean }`，包含正在录制的句子与临时标记 |
| `lyrics-phase-change` | `{ phase: 'rough' \| 'complete' \| 'refine' }` |
| `lyrics-request-close` | `{ dirty: boolean }`，Escape 或 `requestClose()` 发出 |

事件与 `getDocument()` 返回独立快照，不暴露内部可变数据。保存事件由宿主持久化；组件不会上传、关闭或自动清除 dirty 状态。通知不应直接触发不可重复的远端写操作。

方法：

- `load(options)`：载入新会话。
- `pause()`：暂停并提交当前录制句；键盘 Enter 在点按模式下保留当前句以便续打。
- `focus()`：聚焦工作区，使键盘快捷键作用于此实例。
- `requestClose()`：暂停并请求宿主决定是否关闭。
- `getDocument()`：读取包含正在录制句的快照；可能仍有 `timeMs: null`，导出前使用 `timingIssues()` 校验。

### 放进自己的弹窗

```ts
editor.addEventListener('lyrics-request-close', event => {
  if (!event.detail.dirty || window.confirm('放弃未保存的修改？')) {
    dialog.close();
    editor.remove();
  }
});
closeButton.addEventListener('click', () => editor.requestClose());
```

原生 dialog、Semi Modal、Ant Design Modal、抽屉和普通页面都可作为宿主。弹窗、退出确认、模式选择、说明页和路由拦截由宿主负责。自定义确认弹窗打开期间设置 `editor.keyboardEnabled = false`，关闭后恢复并 `editor.focus()`。路由保护监听 `lyrics-dirty-change`。

### React 接入

React 只存在于使用方，不是组件包的依赖。React 19 可直接渲染原生元素；下面的适配也适用于 React 18：

```tsx
import { useLayoutEffect, useRef } from 'react';
import { defineLyricsEditor } from 'lyricue';

export function Editor() {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    defineLyricsEditor();
    const editor = document.createElement('lyrics-editor');
    editor.addEventListener('lyrics-save', event => console.log(event.detail.lyrics));
    editor.load({ audioSrc: '/song.mp3', lyrics: '第一句\n第二句' });
    container.current!.append(editor);
    return () => editor.remove();
  }, []);
  return <div ref={container} />;
}
```

### Vue 接入

注册 `defineLyricsEditor()`，并在 Vue 模板编译配置中将 `lyrics-editor` 声明为 `isCustomElement`，即可使用：

```html
<lyrics-editor audio-src="/song.mp3" :lyrics.prop="sourceLyrics"
  @lyrics-save="saveLyrics($event.detail.lyrics)" />
```

无需 React 适配器；其他框架同样通过 DOM 属性、方法与 CustomEvent 接入。

## 快捷键

快捷键限于聚焦的编辑器，不影响外部输入框或其他实例。键帽也支持鼠标点击；长按键帽支持指针捕获。

| 键 | 粗打 | 精调 |
| --- | --- | --- |
| Enter | 开始／暂停，长按模式提交当前句再暂停 | 播放／暂停 |
| Space | 点按切下一句，或按住开始／松开结束 | 播放／暂停 |
| Backspace | 重打上一句，首句回到 0 秒 | — |
| L | 添加时间标记 | 添加／取消当前标记 |
| 左／右 | 前后定位播放位置 | 定位到上一个／下一个标记 |
| Cmd/Ctrl+Z | 撤销 | 撤销 |
| Cmd/Ctrl+Shift+Z | 重做 | 重做 |
| `+`／`-`／`0` | 缩放／适配整曲 | 缩放／适配整曲 |
| Cmd/Ctrl+Enter | — | 保存 |

Ctrl/Cmd+滚轮可缩放；拖拽时按 Shift 临时关闭吸附。边界聚焦后 Shift+左右方向键做 1ms 调整，Enter／Space 短试听。临时标记不写入 LRC。

## 纯算法入口

```ts
import { parseLyrics, serializeLyrics, timingIssues, prepareRecordingLyrics }
  from 'lyricue/core';
const document = prepareRecordingLyrics(sourceText, true); // 可选：去除 Suno 标记
const timed = parseLyrics('[00:01.200]第一句\n[00:03.000]');
if (timingIssues(timed.lines, 120000).size === 0) console.log(serializeLyrics(timed));
```

另有 `buildAudioWaveform`、`beginLyricTake`、`resizeLyricBoundary`、`lyricBoundaryPreview` 和标记工具。音频时间为整数毫秒，未打轴 `timeMs: null`，可选 `endMs` 表示显式句尾，空 LRC 时间标签保留间奏。

根入口可在 Node.js 中安全导入；实际注册与挂载需要浏览器。`/register` 在无 DOM 环境不执行注册，不能在 SSR 中渲染交互内容。

## 样式与音频边界

Shadow DOM 自动包含样式，不修改宿主 `body`、全局 button 或主题。在组件／父元素设置：

```css
lyrics-editor {
  --lyrics-editor-accent: #246c52;
  --lyrics-editor-accent-active: #17513c;
  --lyrics-editor-text: #242424;
  --lyrics-editor-muted: #656565;
  --lyrics-editor-border: #d9ded9;
  --lyrics-editor-font-family: system-ui, sans-serif;
}
```

可使用 `::part(editor)`、`::part(timeline)`、`::part(preview)` 定制外观。界面使用亮色底色；外部 class 选择器不会穿透 Shadow DOM。

波形需要 fetch 并解码整份音频，跨域服务器必须允许宿主页 Origin 的 GET 请求。音频服务应支持 HTTP Range，以便准确跳转和片段试听。音频可播放不代表可跨域读取波形。失败时可重试并继续打轴。浏览器可解码格式因平台而异，不适用于没有大小边界的超大文件。

宿主负责签名 URL、授权、文件大小限制、持久化及 Blob URL 释放。组件不生成签名、不代理音频、不保存凭证；签名过期或切换音频时，获取新 URL 后显式重新 load。

## GitHub Pages 演示

[在线体验](https://qianyinshi.github.io/lyricue/)。推送 `main` 后，GitHub Actions 会在检查和测试通过后构建并发布演示。首次启用及本地预览见 [部署说明](docs/github-pages.md)。

```sh
npm run build:demo
npm run preview:demo
```

演示产物为 `demo-dist/`，库产物仍是 `dist/`；资源使用相对 URL，支持 `/lyricue/` 项目路径和自定义域名。

## 开发与发布

在本仓库根目录：

```sh
npm run dev
npm run verify:package
```

独立示例位于 `http://127.0.0.1:4185`，只使用原生 HTML／TypeScript，提供原创合成的 20 秒音乐片段，也可选自己的音频和歌词，支持打轴、精调、下载和复制 LRC；文件只在浏览器中处理。

`verify:package` 检查、运行 65 项算法测试、构建、打包，并在工作区外的**无框架项目**安装真实 `.tgz`，校验无 runtime／peer dependencies、公开文件清单、Node 安全导入、纯算法 round trip 和严格 NodeNext 类型消费。命令输出临时项目与打包文件路径。

发布前确认 npm 包名可用性、账号权限和版本，并移除 `private: true`。完成打包及独立使用验证后再执行 `npm publish --access public`，首版建议使用 `0.1.0` 或 `next` 预发布 tag。


## 单屏应用与中英文界面

`locale` 属性／选项（HTML 同名）支持 `'zh-CN'`（默认）与 `'en'`，只切换组件界面，保留歌词原文。

`keyboardScope` 属性／选项（HTML 为 `keyboard-scope`）默认 `'focused'`，只在组件获得焦点时响应。单屏工具可设置为 `'page'`，使页面其他位置也响应快捷键；文本输入、原生 dialog 和其他编辑器保留自身键盘操作。同一页面仅启用一个实例的全局快捷键，对隐藏／未激活实例设置 `keyboardEnabled = false`。

打开编辑弹窗或文件选择器前调用 `pause(true)`，点按模式会保留正在打轴的句子，长按模式会提交当前句。默认 `pause()` 行为不变。交互期间禁用 `keyboardEnabled`，结束后恢复快捷键，由用户手动继续播放。

可通过 `::part(phase-label)` 与 `::part(footer)` 调整提示和底部区域；原有 `editor`、`timeline`、`preview` part 继续可用。
