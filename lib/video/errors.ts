/** Error classes shared by every video module. Each sets `name` to its class name. */

export class InvalidTrimError extends Error {
  constructor(message = "The trim range is too short or outside the video.") {
    super(message);
    this.name = "InvalidTrimError";
  }
}

export class TargetTooSmallError extends Error {
  /** Smallest target (bytes) that would still give watchable quality for this length. */
  readonly minBytes: number;

  constructor(minBytes: number) {
    super("The target size is too small for this video length.");
    this.name = "TargetTooSmallError";
    this.minBytes = minBytes;
  }
}

export class TargetNotReachedError extends Error {
  constructor(message = "Could not get the video under the target size.") {
    super(message);
    this.name = "TargetNotReachedError";
  }
}

export class ExportCanceledError extends Error {
  constructor(message = "Export canceled.") {
    super(message);
    this.name = "ExportCanceledError";
  }
}

export class EngineUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnsupportedError";
  }
}
