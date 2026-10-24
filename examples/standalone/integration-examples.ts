/** Copyable examples use only the public package API. */
export const integrationExamples = {
  html: String.raw`<lyrics-editor id="editor"></lyrics-editor>
<script type="module">
  import { defineLyricsEditor } from './vendor/lyricue/index.js';

  defineLyricsEditor();
  const editor = document.querySelector('#editor');
  editor.load({
    audioSrc: './song.mp3',
    lyrics: 'First line\nSecond line',
    mode: 'tap',
    locale: 'en',
    theme: 'auto',
  });
  editor.addEventListener('lyrics-save', ({ detail }) => {
    console.log(detail.lyrics);
  });
</script>`,
  react: String.raw`import React, { useEffect, useRef } from 'react';
import { defineLyricsEditor } from 'lyricue';

export default function App() {
  const mount = useRef(null);

  useEffect(() => {
    defineLyricsEditor();
    const editor = document.createElement('lyrics-editor');
    editor.load({
      audioSrc: '/song.mp3',
      lyrics: 'First line\nSecond line',
      mode: 'tap',
      locale: 'en',
      theme: 'auto',
    });
    const onSave = ({ detail }) => console.log(detail.lyrics);
    editor.addEventListener('lyrics-save', onSave);
    mount.current.append(editor);

    return () => {
      editor.removeEventListener('lyrics-save', onSave);
      editor.remove();
    };
  }, []);

  return <div ref={mount} />;
}`,
  vue: String.raw`<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { defineLyricsEditor } from 'lyricue';

const mount = ref(null);
let editor;
const onSave = ({ detail }) => console.log(detail.lyrics);

onMounted(() => {
  defineLyricsEditor();
  editor = document.createElement('lyrics-editor');
  editor.load({
    audioSrc: '/song.mp3',
    lyrics: 'First line\nSecond line',
    mode: 'tap',
    locale: 'en',
    theme: 'auto',
  });
  editor.addEventListener('lyrics-save', onSave);
  mount.value.append(editor);
});

onBeforeUnmount(() => {
  editor?.removeEventListener('lyrics-save', onSave);
  editor?.remove();
});
</script>

<template>
  <div ref="mount"></div>
</template>`,
};
