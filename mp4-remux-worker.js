'use strict';

importScripts('mp4-remux.js');

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type !== 'mux') return;

  try {
    const video = new Uint8Array(message.video);
    const audio = new Uint8Array(message.audio);
    const output = self.YTSSMp4Remux.muxFragmentedMp4(video, audio, progress => {
      self.postMessage({ type: 'progress', progress });
    });
    const buffer = output.byteOffset === 0 && output.byteLength === output.buffer.byteLength ? output.buffer : output.slice().buffer;
    self.postMessage({ type: 'result', buffer }, [buffer]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      code: error?.code || 'mux-failed',
      message: error?.message || String(error)
    });
  }
});
