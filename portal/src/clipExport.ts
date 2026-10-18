import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

/** What the coach needs to know about a match file before tagging it. */
export interface MatchFileInfo {
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string | null;
  /** RFC 6381 string, e.g. "avc1.640028" – used to check browser playback. */
  codecString: string | null;
  hasAudio: boolean;
  /** Seconds between the first two key frames: how far before the chosen start a clip may begin. */
  keyFrameIntervalSec: number | null;
}

/** Reads only the parts of the file it needs (a 3 GB match is never loaded into memory). */
export async function inspectMatchFile(file: Blob): Promise<MatchFileInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('Filen innehåller ingen video.');
    const audio = await input.getPrimaryAudioTrack();
    const sink = new EncodedPacketSink(video);
    const k1 = await sink.getFirstKeyPacket();
    const k2 = k1 ? await sink.getNextKeyPacket(k1) : null;
    return {
      durationSec: await input.computeDuration(),
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      videoCodec: await video.getCodec(),
      codecString: await video.getCodecParameterString(),
      hasAudio: audio != null,
      keyFrameIntervalSec: k1 && k2 ? k2.timestamp - k1.timestamp : null,
    };
  } finally {
    input.dispose();
  }
}

export interface ExportedClip {
  blob: Blob;
  /** Where the clip actually starts/ends in the match (key-frame aligned), in seconds. */
  startSec: number;
  endSec: number;
}

/**
 * Copies [startSec, endSec] out of the match without re-encoding (same quality, fast).
 * The clip starts at the last key frame at or before startSec and ends at the first
 * key frame at or after endSec, so it is never shorter than requested.
 */
export async function exportClip(file: Blob, startSec: number, endSec: number): Promise<ExportedClip> {
  if (!(endSec > startSec)) throw new Error('Klippets slut måste vara efter starten.');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('Filen innehåller ingen video.');
    const videoCodec = await video.getCodec();
    const videoConfig = await video.getDecoderConfig();
    if (!videoCodec || !videoConfig) throw new Error('Videoformatet stöds inte för klippning.');

    const duration = await video.computeDuration();
    if (startSec >= duration) throw new Error('Klippets start ligger efter videons slut.');
    endSec = Math.min(endSec, duration);
    startSec = Math.max(0, startSec);

    const vSink = new EncodedPacketSink(video);
    const startKey = (await vSink.getKeyPacket(startSec)) ?? (await vSink.getFirstKeyPacket());
    if (!startKey) throw new Error('Hittade ingen startbild i videon.');
    let endKey = await vSink.getKeyPacket(endSec);
    if (endKey && endKey.timestamp < endSec) endKey = await vSink.getNextKeyPacket(endKey);
    if (endKey && endKey.timestamp <= startKey.timestamp) endKey = await vSink.getNextKeyPacket(startKey);
    const t0 = startKey.timestamp;
    const t1 = endKey ? endKey.timestamp : duration;

    const audio = await input.getPrimaryAudioTrack();
    const audioCodec = audio ? await audio.getCodec() : null;
    const audioConfig = audio ? await audio.getDecoderConfig() : null;

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const vOut = new EncodedVideoPacketSource(videoCodec);
    output.addVideoTrack(vOut, { rotation: await video.getRotation() });
    const aOut = audio && audioCodec && audioConfig ? new EncodedAudioPacketSource(audioCodec) : null;
    if (aOut) output.addAudioTrack(aOut);
    await output.start();

    let first = true;
    for await (const p of vSink.packets(startKey, endKey ?? undefined)) {
      await vOut.add(p.clone({ timestamp: p.timestamp - t0 }), first ? { decoderConfig: videoConfig } : undefined);
      first = false;
    }

    if (aOut && audio && audioConfig) {
      const aSink = new EncodedPacketSink(audio);
      const from = (await aSink.getPacket(t0)) ?? (await aSink.getFirstPacket());
      let firstAudio = true;
      if (from) {
        for await (const p of aSink.packets(from)) {
          if (p.timestamp >= t1) break;
          const ts = p.timestamp - t0;
          if (ts < 0) continue;
          await aOut.add(p.clone({ timestamp: ts }), firstAudio ? { decoderConfig: audioConfig } : undefined);
          firstAudio = false;
        }
      }
    }

    await output.finalize();
    if (!target.buffer) throw new Error('Klippet kunde inte skapas.');
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), startSec: t0, endSec: t1 };
  } finally {
    input.dispose();
  }
}
