import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../src/components/i18n.ts';

test('UI language can round trip repeatedly without translating unknown content', () => {
  for (const source of ['播放', '回车', '粗打完成', '重试音频', '打标/取消打标']) {
    const english = translate(source, 'en');
    assert.notEqual(english, source);
    assert.equal(translate(english, 'en'), english);
    assert.equal(translate(english, 'zh-CN'), source);
  }
  for (const source of ['An arbitrary song title', '<script>alert(1)</script>', '床前明月光']) {
    assert.equal(translate(source, 'en'), source);
    assert.equal(translate(source, 'zh-CN'), source);
  }
});
