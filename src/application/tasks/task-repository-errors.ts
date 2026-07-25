export class TaskRepositoryError extends Error {
  public readonly code: string = 'TASK_REPOSITORY_ERROR';

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class TaskRepositoryNotFoundError extends TaskRepositoryError {
  public override readonly code = 'TASK_NOT_FOUND';
}

export class TaskRepositoryConflictError extends TaskRepositoryError {
  public override readonly code = 'TASK_CONFLICT';
}

export class TaskRepositoryCorruptionError extends TaskRepositoryError {
  public override readonly code = 'TASK_DATA_CORRUPT';
}
