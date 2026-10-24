/** Only package-owned UI strings are translated; lyric content is always preserved. */
const english: Record<string, string> = {
  "重试波形": "Retry waveform",
  "播放": "Play",
  "保存歌词": "Save lyrics",
  "重试音频": "Retry audio",
  "歌词打轴工作区": "Lyrics timing workspace",
  "接下来，拖拽歌词滑块的位置或边界，": "Next, drag lyric clips or their edges",
  "精细调整每一句歌词的精确时间。": "to fine-tune the timing of every line.",
  "粗打完成": "First pass complete",
  "开始精调": "Fine-tune timing",
  "播放失败，请重试或重新选择音频。": "Playback failed. Retry or choose another audio file.",
  "无法读取音频时长，请重新选择可播放的音乐文件。": "Cannot read audio duration. Choose another playable file.",
  "音频加载失败或浏览器不支持此格式，请重试或重新选择音频。": "Cannot load this audio format. Retry or choose another file.",
  "无法生成波形，请重试。也可以继续播放音频并调整歌词边界。": "Cannot generate the waveform. Retry, or continue adjusting lyrics with audio.",
  "回车": "Enter",
  "空格": "Space",
  "退格": "Backspace",
  "回车：开始/暂停打轴": "Enter: start or pause timing",
  "开始/暂停打轴": "Start / pause timing",
  "空格：进入下一句": "Space: next line",
  "空格：按住开始，松开结束": "Space: hold to start, release to end",
  "进入下一句": "Next line",
  "按住开始，松开结束": "Hold to start, release to end",
  "退格：重打上一句": "Backspace: redo previous line",
  "重打上一句": "Redo previous line",
  "L：添加标记": "L: add marker",
  "添加标记": "Add marker",
  "回车：播放/暂停": "Enter: play or pause",
  "空格：播放/暂停": "Space: play or pause",
  "播放/暂停": "Play / pause",
  "左方向键：上一个标记": "Left: previous marker",
  "右方向键：下一个标记": "Right: next marker",
  "定位到上一个/下一个标记": "Previous / next marker",
  "L：打标/取消打标": "L: toggle marker",
  "打标/取消打标": "Toggle marker",
  "拖拽歌词方块边缘，精细调整每句话的位置。": "Drag lyric edges to fine-tune the timing.",
  "点击空格键切换下一句歌词。打错了也不要紧，继续打完，然后再调整。": "Tap Space for the next line. Keep going; you can fine-tune afterward.",
  "按住空格键标记当前句，松开切换下一句歌词。打错了也不要紧，继续打完，然后再调整。": "Hold Space for a line, then release. Keep going; you can fine-tune afterward.",
  "正在加载音频轨道…": "Loading audio track…",
  "正在读取音频并生成波形…": "Generating waveform…",
  "没有可编辑的歌词，请传入歌词后重新打开编辑器。": "Add lyrics to start editing.",
  "正在加载音频…": "Loading audio…",
  "正在缓冲…": "Buffering…",
  "时间范围无效，请拖拽歌词边界调整": "Invalid timing. Drag the lyric edges to adjust.",
  "时间范围无效，请选句后按 Delete 重打": "Invalid timing. Select a line and press Delete to redo.",
  "暂停": "Pause",
  "继续": "Resume",
  "滚动歌词预览": "Scrolling lyrics preview",
  "歌词时间线微调": "Lyrics timeline",
  "音频与歌词轨道，横向滚动查看": "Audio and lyric tracks. Scroll horizontally to explore.",
  "真实音频波形": "Audio waveform",
  "音频波形待加载": "Waveform loading",
  "单侧编辑：只调整本句": "Trim: adjust this line only",
  "双侧编辑：同时调整相邻两句": "Roll: adjust both adjacent lines"
};
const chinese = new Map(Object.entries(english).map(([zh, en]) => [en, zh]));
export function translate(value: string, locale: 'zh-CN' | 'en' = 'zh-CN') {
  const original = chinese.get(value) ?? value;
  return locale === 'en' ? english[original] ?? original : original;
}
export function translateUI(root: HTMLElement, locale: 'zh-CN' | 'en' = 'zh-CN') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('.lyric-clip-text, .lyric-timeline-pending, .lyric-playback-preview p')) continue;
    const next = translate(node.textContent ?? '', locale);
    if (node.textContent !== next) node.textContent = next;
  }
  for (const node of [root, ...root.querySelectorAll<HTMLElement>('[aria-label], [title]')]) {
    for (const attribute of ['aria-label', 'title']) {
      const value = node.getAttribute(attribute); if (value === null) continue;
      const next = translate(value, locale); if (next !== value) node.setAttribute(attribute, next);
    }
  }
}
