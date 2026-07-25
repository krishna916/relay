import { TaskRepositoryNotFoundError } from '../task-repository-errors.js';
import { TaskNotFoundError, TaskPersistenceError } from '../task-application-errors.js';

export function persist<T>(operation: () => T, message: string): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TaskRepositoryNotFoundError)
      throw new TaskNotFoundError(message, { cause: error });
    throw new TaskPersistenceError(message, { cause: error });
  }
}

export function required<T>(operation: () => T | null, id: string): T {
  const result = persist(operation, `Task ${id} could not be loaded.`);
  if (result === null) throw new TaskNotFoundError(`Task ${id} was not found.`);
  return result;
}
