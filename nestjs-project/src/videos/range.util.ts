import { VideoRangeInvalidException } from './video.exceptions';

export interface ByteRange {
  start: number;
  end: number;
  header: string;
  length: number;
}

export function parseByteRange(
  value: string | undefined,
  size: number,
): ByteRange | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) {
    throw new VideoRangeInvalidException();
  }
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      throw new VideoRangeInvalidException();
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      throw new VideoRangeInvalidException();
    }
    end = Math.min(end, size - 1);
  }
  if (start < 0 || start >= size || end < start) {
    throw new VideoRangeInvalidException();
  }
  return {
    start,
    end,
    header: `bytes=${start}-${end}`,
    length: end - start + 1,
  };
}
