// Completed event playback, followed by five seconds of reading time.
export function createProgressPlayback({events, onEvent, onState, onComplete,
  delayFor = () => 500, immediate = false, active = () => true,
  now = () => performance.now(), setTimer = setInterval, clearTimer = clearInterval}) {
  let index = 0, paused = false, stopped = false, timer = null, last = now();
  let phase = 'events', remaining = 0;
  const emit = () => onState({paused, phase, seconds: Math.ceil(remaining / 1000)});
  const stop = () => { stopped = true; if (timer !== null) clearTimer(timer); timer = null; };
  const next = () => { if (stopped) return; stop(); onComplete(); };
  const show = () => {
    if (events.length) onEvent(events[index]);
    phase = index >= events.length - 1 ? 'reading' : 'events';
    remaining = phase === 'reading' ? 5000 : delayFor(events[index]);
    emit();
  };
  if (immediate) {
    events.forEach(onEvent);
    phase = 'reading'; remaining = 5000; emit();
  } else show();
  timer = setTimer(() => {
    const current = now(), elapsed = Math.max(0, current - last); last = current;
    if (stopped || paused || !active()) return;
    remaining = Math.max(0, remaining - elapsed);
    if (remaining > 0) { emit(); return; }
    if (phase === 'reading') { next(); return; }
    index++; show();
  }, 100);
  return {stop, next, toggle() {
    if (stopped) return;
    paused = !paused; last = now(); emit();
  }};
}
