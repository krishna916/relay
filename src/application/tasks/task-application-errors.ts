export class TaskApplicationError extends Error {
  public readonly code: string = 'TASK_APPLICATION_ERROR';

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class TaskNotFoundError extends TaskApplicationError {
  public override readonly code = 'TASK_NOT_FOUND';
}

export class InvalidTaskRequestError extends TaskApplicationError {
  public override readonly code = 'INVALID_TASK_REQUEST';
}

export class TaskPersistenceError extends TaskApplicationError {
  public override readonly code = 'TASK_PERSISTENCE_ERROR';
}
