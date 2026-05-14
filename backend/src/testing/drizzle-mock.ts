type QueueMap = {
  delete?: unknown[];
  execute?: unknown[];
  insert?: unknown[];
  select?: unknown[];
  update?: unknown[];
  transactionErrors?: unknown[];
};

type Operation = keyof Omit<QueueMap, "transactionErrors">;
type MockClient = {
  delete: jest.Mock;
  execute: jest.Mock;
  insert: jest.Mock;
  select: jest.Mock;
  transaction: jest.Mock;
  update: jest.Mock;
};
type MockBuilder = {
  from: jest.Mock;
  groupBy: jest.Mock;
  innerJoin: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  orderBy: jest.Mock;
  returning: jest.Mock;
  set: jest.Mock;
  then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  values: jest.Mock;
  where: jest.Mock;
};

export function drizzleMock(queues: QueueMap = {}) {
  const state = {
    delete: [...(queues.delete ?? [])],
    execute: [...(queues.execute ?? [])],
    insert: [...(queues.insert ?? [])],
    select: [...(queues.select ?? [])],
    update: [...(queues.update ?? [])],
    transactionErrors: [...(queues.transactionErrors ?? [])]
  };

  const client: MockClient = {
    delete: jest.fn(() => builder(state, "delete")),
    execute: jest.fn(async () => next(state, "execute")),
    insert: jest.fn(() => builder(state, "insert")),
    select: jest.fn(() => builder(state, "select")),
    transaction: jest.fn(async (callback: (tx: typeof client) => unknown) => {
      const error = state.transactionErrors.shift();
      if (error !== undefined) {
        throw error;
      }
      return callback(client);
    }),
    update: jest.fn(() => builder(state, "update"))
  };

  return {
    client,
    service: { client },
    state
  };
}

function builder(state: Required<QueueMap>, operation: Operation): MockBuilder {
  const api: MockBuilder = {
    from: jest.fn(() => api),
    groupBy: jest.fn(() => api),
    innerJoin: jest.fn(() => api),
    limit: jest.fn(() => api),
    offset: jest.fn(() => api),
    onConflictDoUpdate: jest.fn(() => api),
    orderBy: jest.fn(() => api),
    returning: jest.fn(async () => next(state, operation)),
    set: jest.fn(() => api),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(next(state, operation)).then(resolve, reject),
    values: jest.fn(() => api),
    where: jest.fn(() => api)
  };
  return api;
}

function next(state: Required<QueueMap>, operation: Operation): unknown[] | { rows: unknown[] } {
  const queue = state[operation];
  if (queue.length === 0) {
    return [];
  }
  const value = queue.shift()!;
  if (value instanceof Error) {
    throw value;
  }
  return value as unknown[] | { rows: unknown[] };
}
