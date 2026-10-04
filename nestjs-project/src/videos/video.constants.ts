export const VIDEO_QUEUE = 'video-processing';
export const VIDEO_JOB = 'video.process';
export const MAX_VIDEO_BYTES = 10_000_000_000;
export const PART_SIZE = 64 * 1024 * 1024;
export const MAX_PARTS = Math.ceil(MAX_VIDEO_BYTES / PART_SIZE);
