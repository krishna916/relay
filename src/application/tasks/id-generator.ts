import { randomUUID } from 'node:crypto';

export interface IdGenerator {
  generate(): string;
}

export class UuidGenerator implements IdGenerator {
  public generate(): string {
    return randomUUID();
  }
}
