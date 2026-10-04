import { DomainException } from '../common/exceptions/domain.exception';

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoInvalidPartException extends DomainException {
  constructor() {
    super('VIDEO_INVALID_PART', 400, 'Invalid or incomplete part list');
  }
}

export class VideoInvalidStateException extends DomainException {
  constructor() {
    super('VIDEO_INVALID_STATE', 409, 'Video is not in the required state');
  }
}

export class VideoUploadIncompleteException extends DomainException {
  constructor() {
    super(
      'VIDEO_UPLOAD_INCOMPLETE',
      400,
      'Uploaded object size does not match',
    );
  }
}

export class VideoRangeInvalidException extends DomainException {
  constructor() {
    super('VIDEO_RANGE_INVALID', 416, 'Invalid byte range');
  }
}
