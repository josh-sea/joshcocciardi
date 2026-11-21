/* Whistle Rig: heavy lifting off the main thread. */
import { analyze } from './pitch.js';
import { render } from './synth.js';

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'analyze') {
      const raw = await analyze(e.data.x, { onProgress: (p) => self.postMessage({ id, progress: p }) });
      self.postMessage({ id, result: raw }, [raw.hz.buffer, raw.clarity.buffer, raw.rms.buffer]);
    } else if (type === 'render') {
      const y = render(e.data.perf, e.data.name, { sr: e.data.sr });
      self.postMessage({ id, result: y }, [y.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
