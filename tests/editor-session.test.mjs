import assert from 'node:assert/strict';
import test from 'node:test';
import { readEditorSession } from '../src/lib/editor-session.ts';
import { ProjectStore, projectKey } from '../examples/standalone/projects.ts';
const initial = () => ({version:1,state:{lines:[{text:'甲',timeMs:1000,endMs:2000},{text:'乙',timeMs:null}],metadata:['[ti:歌]'],selected:1,past:[{lines:[{text:'甲',timeMs:null},{text:'乙',timeMs:null}],metadata:[],selected:0}],future:[]},original:{lines:[{text:'甲',timeMs:null},{text:'乙',timeMs:null}],metadata:[]},mode:'tap',phase:'rough',markers:[{id:1,timeMs:1500}],positionMs:2500,hasStarted:true,take:{base:[{text:'甲',timeMs:1000,endMs:2000},{text:'乙',timeMs:null}],index:1,startMs:2000,durationMs:10000,mode:'tap',input:'keyboard'},viewport:{scale:120,scrollLeft:250}});
test('sessions round-trip partial timing, open tap, markers, history and viewport as detached JSON',()=>{
 const source=initial(),restored=readEditorSession(JSON.parse(JSON.stringify(source)));assert.deepEqual(restored,source);
 restored.state.lines[0].text='changed';restored.markers[0].timeMs=999;restored.state.past[0].lines[0].text='history';restored.take.base[0].text='take';
 assert.equal(source.state.lines[0].text,'甲');assert.equal(source.markers[0].timeMs,1500);assert.equal(source.state.past[0].lines[0].text,'甲');assert.equal(source.take.base[0].text,'甲');
 assert.doesNotMatch(JSON.stringify(source),/audioSrc|blob:|waveform|data:audio/);
});
test('malformed, non-finite, future-version and incompatible session data is rejected',()=>{
 for(const modify of [s=>s.version=2,s=>s.positionMs=NaN,s=>s.state.selected=5,s=>s.state.past=[{}],s=>s.original.lines[0].text=null,s=>s.markers=[{id:1,timeMs:-1}],s=>s.viewport.scale=0,s=>s.take.index=99,s=>s.phase='refine',s=>s.mode='random']){const value=initial();modify(value);assert.equal(readEditorSession(value),null);}
 for(const value of [null,undefined,[],{},'bad'])assert.equal(readEditorSession(value),null);
});
test('completed timing restores in refinement without a take',()=>{
 const value=initial();value.take=null;value.state.lines[1].timeMs=3000;value.phase='refine';assert.deepEqual(readEditorSession(value),value);
 value.state.lines[1].timeMs=null;assert.equal(readEditorSession(value),null);
});
function memory(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const project = fingerprint => ({version:1,fingerprint,filename:'Song.wav',size:100,durationMs:10000,sourceLyrics:'甲\n乙',removeSuno:true,session:initial(),updatedAt:1234});
test('projects are isolated by audio fingerprint, not filename; drafts and preferences are separate',()=>{
 const backing=memory(),store=new ProjectStore(backing);store.write(project('hash-a'));const second=project('hash-b');second.sourceLyrics='other';store.write(second);
 assert.equal(store.read('hash-a').sourceLyrics,'甲\n乙');assert.equal(store.read('hash-b').sourceLyrics,'other');assert.equal(store.read('unknown'),null);
 store.setPreference('recording-mode','hold');store.saveDraft('hash-a','unfinished');assert.equal(store.preference('recording-mode'),'hold');assert.equal(store.draft('hash-a'),'unfinished');store.clearDraft('hash-a');assert.equal(store.draft('hash-a'),null);assert.ok(store.read('hash-a'));
 assert.doesNotMatch(backing.map.get(projectKey('hash-a')),/audioSrc|blob:|base64|waveform/);
});
test('corrupt storage never crashes loading and quota failures preserve the previous saved project',()=>{
 const backing=memory(),store=new ProjectStore(backing);store.write(project('hash-a'));const before=backing.map.get(projectKey('hash-a'));
 const unavailable=new ProjectStore({...backing,setItem:()=>{throw new Error('quota');}});assert.throws(()=>unavailable.write({...project('hash-a'),sourceLyrics:'new'}),/quota/);assert.equal(backing.map.get(projectKey('hash-a')),before);
 backing.map.set(projectKey('bad'),'{corrupt');assert.equal(store.read('bad'),null);backing.map.set(projectKey('bad'),JSON.stringify({...project('bad'),durationMs:-1}));assert.equal(store.read('bad'),null);
 const blocked=new ProjectStore({getItem:()=>{throw new Error('blocked');},setItem:()=>{},removeItem:()=>{}});assert.equal(blocked.read('hash-a'),null);assert.equal(blocked.preference('locale'),null);
});

test('session restoration rejects ambiguous enums, duplicate markers and incompatible active phrases', () => {
 for (const modify of [
  s => s.mode = ['tap'], s => s.phase = ['rough'], s => s.take.input = ['keyboard'],
  s => s.markers.push({...s.markers[0], timeMs: 2000}), s => s.take.mode = 'hold',
  s => s.take.base.pop(), s => s.take.base[0].text = 'another lyric',
  s => s.state.past = Array.from({length:101}, () => s.state.past[0]),
  s => s.uncloneable = () => {},
 ]) { const value = initial(); modify(value); assert.equal(readEditorSession(value), null); }
 const empty = initial(); empty.take = null; empty.state.lines = []; empty.state.selected = 0; empty.phase = 'refine';
 assert.equal(readEditorSession(empty), null);
});
