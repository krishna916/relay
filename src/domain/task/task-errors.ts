export abstract class TaskDomainError extends Error {
  public abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class TaskValidationError extends TaskDomainError {
  public readonly code = 'TASK_VALIDATION';

  public constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export class TaskTransitionError extends TaskDomainError {
  public readonly code = 'INVALID_TASK_TRANSITION';

  public constructor(message: string) {
    super(message);
  }
}

export class TaskArchivedError extends TaskDomainError {
  public readonly code = 'TASK_ARCHIVED';

  public constructor(message: string) {
    super(message);
  }
}
