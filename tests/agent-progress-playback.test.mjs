import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProgressPlayback} from '../docker_erd_20261117/app/web/static/agent-progress-playback.mjs';

function setup(options={}) {
  let time=0, tick, done=0, state, visible=true;
  const shown=[];
  const player=createProgressPlayback({events:['first','last'],delayFor:()=>500,
    onEvent:e=>shown.push(e),onState:s=>state=s,onComplete:()=>done++,
    now:()=>time,setTimer:fn=>(tick=fn,1),clearTimer:()=>tick=null,
    active:()=>visible,...options});
  return {player,shown,get state(){return state;},get done(){return done;},
    visible:v=>visible=v,advance:ms=>{time+=ms;tick?.();}};
}
test('holds the full log for five seconds, then advances exactly once',()=>{
  const t=setup();assert.deepEqual(t.shown,['first']);
  t.advance(500);assert.deepEqual(t.shown,['first','last']);assert.equal(t.state.seconds,5);
  t.advance(4999);assert.equal(t.done,0);
  t.advance(1);assert.equal(t.done,1);t.player.next();assert.equal(t.done,1);
});
test('pause freezes both event playback and the final countdown; continue resumes remaining time',()=>{
  const t=setup();t.player.toggle();t.advance(10000);assert.deepEqual(t.shown,['first']);
  t.player.toggle();t.advance(500);t.advance(2000);assert.equal(t.state.seconds,3);
  t.player.toggle();t.advance(10000);assert.equal(t.done,0);assert.equal(t.state.seconds,3);
  t.player.toggle();t.advance(2999);assert.equal(t.done,0);t.advance(1);assert.equal(t.done,1);
});
test('next skips immediately even while paused; cancellation never advances',()=>{
  const t=setup();t.player.toggle();t.player.next();assert.equal(t.done,1);t.advance(20000);assert.equal(t.done,1);
  const cancelled=setup();cancelled.player.stop();cancelled.advance(20000);cancelled.player.next();assert.equal(cancelled.done,0);
});
test('hidden time is excluded and reduced motion still gets five seconds to read',()=>{
  const t=setup({immediate:true});assert.deepEqual(t.shown,['first','last']);
  t.visible(false);t.advance(20000);assert.equal(t.done,0);
  t.visible(true);t.advance(4999);assert.equal(t.done,0);t.advance(1);assert.equal(t.done,1);
});
