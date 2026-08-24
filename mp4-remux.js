(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YTSSMp4Remux = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const decoder = new TextDecoder('ascii');
  const encoder = new TextEncoder();

  class Mp4RemuxError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'Mp4RemuxError';
      this.code = code;
    }
  }

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('Expected ArrayBuffer or Uint8Array.');
  }

  function u32(data, offset) {
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, false);
  }

  function setU32(data, offset, value) {
    new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(offset, value >>> 0, false);
  }

  function u64(data, offset) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return (BigInt(view.getUint32(offset, false)) << 32n) | BigInt(view.getUint32(offset + 4, false));
  }

  function setU64(data, offset, value) {
    const v = BigInt(value);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint32(offset, Number((v >> 32n) & 0xffffffffn), false);
    view.setUint32(offset + 4, Number(v & 0xffffffffn), false);
  }

  function typeAt(data, offset) {
    return decoder.decode(data.subarray(offset, offset + 4));
  }

  function parseBox(data, offset, limit) {
    if (offset + 8 > limit) return null;
    let size = u32(data, offset);
    const type = typeAt(data, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > limit) throw new Mp4RemuxError('invalid-box', `Invalid extended ${type} box.`);
      const extended = u64(data, offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Mp4RemuxError('box-too-large', `${type} box is too large.`);
      size = Number(extended);
      headerSize = 16;
    } else if (size === 0) {
      size = limit - offset;
    }
    if (size < headerSize || offset + size > limit) {
      throw new Mp4RemuxError('invalid-box', `Invalid ${type} box size.`);
    }
    return { type, start: offset, size, end: offset + size, headerSize, dataStart: offset + headerSize };
  }

  function boxes(data, start = 0, end = data.length) {
    const out = [];
    let pos = start;
    while (pos + 8 <= end) {
      const box = parseBox(data, pos, end);
      if (!box) break;
      out.push(box);
      pos = box.end;
    }
    return out;
  }

  function childBoxes(data, parent) {
    return boxes(data, parent.dataStart, parent.end);
  }

  function firstBox(data, type, start = 0, end = data.length) {
    return boxes(data, start, end).find(box => box.type === type) || null;
  }

  function child(data, parent, type) {
    return childBoxes(data, parent).find(box => box.type === type) || null;
  }

  function copyRange(data, box) {
    return data.slice(box.start, box.end);
  }

  function makeBox(type, parts) {
    const payloadSize = parts.reduce((n, part) => n + part.length, 0);
    const total = payloadSize + 8;
    if (total > 0xffffffff) throw new Mp4RemuxError('box-too-large', `${type} box exceeds 32-bit size.`);
    const out = new Uint8Array(total);
    setU32(out, 0, total);
    out.set(encoder.encode(type).subarray(0, 4), 4);
    let cursor = 8;
    for (const part of parts) {
      out.set(part, cursor);
      cursor += part.length;
    }
    return out;
  }

  function findTrack(data, handler) {
    const moov = firstBox(data, 'moov');
    if (!moov) throw new Mp4RemuxError('missing-moov', 'MP4 is missing moov metadata.');
    for (const trak of childBoxes(data, moov).filter(b => b.type === 'trak')) {
      const mdia = child(data, trak, 'mdia');
      const hdlr = mdia && child(data, mdia, 'hdlr');
      if (!hdlr || hdlr.dataStart + 12 > hdlr.end) continue;
      if (typeAt(data, hdlr.dataStart + 8) === handler) return trak;
    }
    return null;
  }

  function trackId(data, trak) {
    const tkhd = child(data, trak, 'tkhd');
    if (!tkhd) throw new Mp4RemuxError('missing-tkhd', 'Track is missing tkhd.');
    const version = data[tkhd.dataStart];
    const offset = tkhd.dataStart + (version === 1 ? 20 : 12);
    if (offset + 4 > tkhd.end) throw new Mp4RemuxError('invalid-tkhd', 'Invalid tkhd track id.');
    return u32(data, offset);
  }

  function trackTimescale(data, trak) {
    const mdia = child(data, trak, 'mdia');
    const mdhd = mdia && child(data, mdia, 'mdhd');
    if (!mdhd) throw new Mp4RemuxError('missing-mdhd', 'Track is missing mdhd.');
    const version = data[mdhd.dataStart];
    const offset = mdhd.dataStart + (version === 1 ? 20 : 12);
    if (offset + 4 > mdhd.end) throw new Mp4RemuxError('invalid-mdhd', 'Invalid mdhd timescale.');
    const value = u32(data, offset);
    if (!value) throw new Mp4RemuxError('invalid-timescale', 'Track timescale is zero.');
    return value;
  }

  function patchTrackBox(raw, newId) {
    const out = raw.slice();
    const trak = firstBox(out, 'trak');
    const tkhd = trak && child(out, trak, 'tkhd');
    if (!tkhd) throw new Mp4RemuxError('missing-tkhd', 'Track is missing tkhd.');
    const version = out[tkhd.dataStart];
    setU32(out, tkhd.dataStart + (version === 1 ? 20 : 12), newId);
    return out;
  }

  function trexTrackId(data, trex) {
    if (trex.dataStart + 8 > trex.end) throw new Mp4RemuxError('invalid-trex', 'Invalid trex box.');
    return u32(data, trex.dataStart + 4);
  }

  function patchTrex(raw, newId) {
    const out = raw.slice();
    const trex = firstBox(out, 'trex');
    if (!trex) throw new Mp4RemuxError('missing-trex', 'Missing trex box.');
    setU32(out, trex.dataStart + 4, newId);
    return out;
  }

  function matchingTrex(data, oldTrackId) {
    const moov = firstBox(data, 'moov');
    const mvex = moov && child(data, moov, 'mvex');
    if (!mvex) throw new Mp4RemuxError('not-fragmented', 'Adaptive MP4 has no mvex box; this mux path expects fragmented MP4.');
    const trex = childBoxes(data, mvex).find(box => box.type === 'trex' && trexTrackId(data, box) === oldTrackId);
    if (!trex) throw new Mp4RemuxError('missing-trex', 'Adaptive MP4 is missing matching trex metadata.');
    return trex;
  }

  function patchMvhd(raw, nextTrackId) {
    const out = raw.slice();
    const mvhd = firstBox(out, 'mvhd');
    if (!mvhd || mvhd.end - mvhd.dataStart < 8) throw new Mp4RemuxError('missing-mvhd', 'Invalid movie header.');
    setU32(out, mvhd.end - 4, nextTrackId);
    return out;
  }

  function containsProtectedBoxes(data) {
    const text = decoder.decode(data.subarray(0, Math.min(data.length, 2 * 1024 * 1024)));
    return /(?:encv|enca|pssh|sinf)/.test(text);
  }

  function mergedMoov(video, audio, videoTrak, audioTrak, videoOldId, audioOldId) {
    const videoMoov = firstBox(video, 'moov');
    const audioMoov = firstBox(audio, 'moov');
    if (!videoMoov || !audioMoov) throw new Mp4RemuxError('missing-moov', 'Adaptive MP4 metadata is incomplete.');
    const vTrex = matchingTrex(video, videoOldId);
    const aTrex = matchingTrex(audio, audioOldId);
    const vChildren = childBoxes(video, videoMoov);
    const mvhd = vChildren.find(b => b.type === 'mvhd');
    if (!mvhd) throw new Mp4RemuxError('missing-mvhd', 'Video MP4 is missing mvhd.');

    const outputChildren = [patchMvhd(copyRange(video, mvhd), 3)];
    // Keep harmless movie-level metadata from the video source, but rebuild track/mvex structures.
    for (const box of vChildren) {
      if (['mvhd', 'trak', 'mvex'].includes(box.type)) continue;
      if (box.type === 'pssh') continue;
      outputChildren.push(copyRange(video, box));
    }
    outputChildren.push(patchTrackBox(copyRange(video, videoTrak), 1));
    outputChildren.push(patchTrackBox(copyRange(audio, audioTrak), 2));

    const videoMvex = child(video, videoMoov, 'mvex');
    const mvexChildren = [];
    for (const box of childBoxes(video, videoMvex)) {
      if (box.type === 'trex') continue;
      mvexChildren.push(copyRange(video, box));
    }
    mvexChildren.push(patchTrex(copyRange(video, vTrex), 1));
    mvexChildren.push(patchTrex(copyRange(audio, aTrex), 2));
    outputChildren.push(makeBox('mvex', mvexChildren));
    return makeBox('moov', outputChildren);
  }

  function fragmentBaseTime(group, moof, timescale) {
    for (const traf of childBoxes(group, moof).filter(b => b.type === 'traf')) {
      const tfdt = child(group, traf, 'tfdt');
      if (!tfdt) continue;
      const version = group[tfdt.dataStart];
      const raw = version === 1 ? u64(group, tfdt.dataStart + 4) : BigInt(u32(group, tfdt.dataStart + 4));
      return Number(raw) / timescale;
    }
    return 0;
  }

  function scanFragments(data, timescale, sourceLabel) {
    const top = boxes(data);
    const out = [];
    for (let i = 0; i < top.length; i++) {
      const moofBox = top[i];
      if (moofBox.type !== 'moof') continue;
      let end = moofBox.end;
      let foundMdat = false;
      for (let j = i + 1; j < top.length; j++) {
        if (top[j].type === 'moof') break;
        end = top[j].end;
        if (top[j].type === 'mdat') { foundMdat = true; i = j; break; }
      }
      if (!foundMdat) throw new Mp4RemuxError('missing-mdat', `${sourceLabel} fragment is missing mdat.`);
      const rawView = data.subarray(moofBox.start, end);
      const localMoof = firstBox(rawView, 'moof');
      out.push({ data, start: moofBox.start, end, byteLength: end - moofBox.start, time: fragmentBaseTime(rawView, localMoof, timescale), source: sourceLabel });
    }
    if (!out.length) throw new Mp4RemuxError('not-fragmented', `${sourceLabel} MP4 contains no media fragments.`);
    return out;
  }

  function patchFragment(raw, oldTrackId, newTrackId, sequenceNumber, newMoofOffset) {
    const out = raw.slice();
    const moof = firstBox(out, 'moof');
    if (!moof) throw new Mp4RemuxError('missing-moof', 'Fragment is missing moof.');
    const mfhd = child(out, moof, 'mfhd');
    if (mfhd && mfhd.dataStart + 8 <= mfhd.end) setU32(out, mfhd.dataStart + 4, sequenceNumber);
    for (const traf of childBoxes(out, moof).filter(b => b.type === 'traf')) {
      const tfhd = child(out, traf, 'tfhd');
      if (!tfhd || tfhd.dataStart + 8 > tfhd.end) continue;
      const id = u32(out, tfhd.dataStart + 4);
      if (id !== oldTrackId) continue;
      setU32(out, tfhd.dataStart + 4, newTrackId);
      const flags = (out[tfhd.dataStart + 1] << 16) | (out[tfhd.dataStart + 2] << 8) | out[tfhd.dataStart + 3];
      if (flags & 0x000001) {
        if (tfhd.dataStart + 16 > tfhd.end) throw new Mp4RemuxError('invalid-tfhd', 'Invalid base_data_offset.');
        setU64(out, tfhd.dataStart + 8, BigInt(newMoofOffset));
      }
    }
    return out;
  }

  function concat(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    if (total > 0x7fffffff) throw new Mp4RemuxError('output-too-large', '合併後檔案超過瀏覽器記憶體安全上限。');
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) { out.set(part, cursor); cursor += part.length; }
    return out;
  }

  function inspectFragmentedMp4(input, handler) {
    const data = asBytes(input);
    const trak = findTrack(data, handler);
    if (!trak) throw new Mp4RemuxError('missing-track', handler === 'vide' ? '找不到影像軌。' : '找不到音訊軌。');
    const id = trackId(data, trak);
    const timescale = trackTimescale(data, trak);
    matchingTrex(data, id);
    const fragments = scanFragments(data, timescale, handler === 'vide' ? 'video' : 'audio');
    return { data, trak, id, timescale, fragments };
  }

  function muxFragmentedMp4(videoInput, audioInput, onProgress) {
    const video = asBytes(videoInput);
    const audio = asBytes(audioInput);
    if (containsProtectedBoxes(video) || containsProtectedBoxes(audio)) {
      throw new Mp4RemuxError('protected-media', '偵測到受保護的 MP4 box；不處理 DRM / encrypted media。');
    }
    const v = inspectFragmentedMp4(video, 'vide');
    const a = inspectFragmentedMp4(audio, 'soun');
    const ftypBox = firstBox(video, 'ftyp') || firstBox(audio, 'ftyp');
    if (!ftypBox) throw new Mp4RemuxError('missing-ftyp', 'MP4 is missing ftyp.');
    const ftypSource = firstBox(video, 'ftyp') ? video : audio;
    const ftyp = copyRange(ftypSource, ftypBox);
    const moov = mergedMoov(video, audio, v.trak, a.trak, v.id, a.id);

    const fragments = [
      ...v.fragments.map(f => ({ ...f, oldId: v.id, newId: 1, order: 0 })),
      ...a.fragments.map(f => ({ ...f, oldId: a.id, newId: 2, order: 1 }))
    ].sort((x, y) => x.time - y.time || x.order - y.order);

    const totalFragments = fragments.length;
    const totalSize = ftyp.length + moov.length + fragments.reduce((sum, fragment) => sum + fragment.byteLength, 0);
    if (totalSize > 0x7fffffff) throw new Mp4RemuxError('output-too-large', '合併後檔案超過瀏覽器記憶體安全上限。');
    const output = new Uint8Array(totalSize);
    let absoluteOffset = 0;
    output.set(ftyp, absoluteOffset);
    absoluteOffset += ftyp.length;
    output.set(moov, absoluteOffset);
    absoluteOffset += moov.length;
    for (let i = 0; i < fragments.length; i++) {
      const f = fragments[i];
      const rawView = f.data.subarray(f.start, f.end);
      const bytes = patchFragment(rawView, f.oldId, f.newId, i + 1, absoluteOffset);
      output.set(bytes, absoluteOffset);
      absoluteOffset += bytes.length;
      if (onProgress) onProgress({ stage: 'mux', completed: i + 1, total: totalFragments, ratio: (i + 1) / totalFragments });
    }
    if (onProgress) onProgress({ stage: 'finalize', completed: totalFragments, total: totalFragments, ratio: 1 });
    return output;
  }

  return {
    Mp4RemuxError,
    muxFragmentedMp4,
    inspectFragmentedMp4
  };
});
