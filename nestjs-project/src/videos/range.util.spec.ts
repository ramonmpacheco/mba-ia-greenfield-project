import { parseByteRange } from './range.util';
import { VideoRangeInvalidException } from './video.exceptions';

describe('parseByteRange', () => {
  it('accepts normal, open-ended and suffix ranges', () => {
    expect(parseByteRange('bytes=1-3', 10)).toEqual({
      start: 1,
      end: 3,
      header: 'bytes=1-3',
      length: 3,
    });
    expect(parseByteRange('bytes=8-', 10)?.header).toBe('bytes=8-9');
    expect(parseByteRange('bytes=-3', 10)?.header).toBe('bytes=7-9');
    expect(parseByteRange(undefined, 10)).toBeNull();
  });

  it.each(['bytes=10-', 'bytes=3-2', 'bytes=0-1,3-4', 'bytes=-0', 'garbage'])(
    'rejects invalid range %s',
    (value) => {
      expect(() => parseByteRange(value, 10)).toThrow(
        VideoRangeInvalidException,
      );
    },
  );
});
