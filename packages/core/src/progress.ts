import { AsyncLocalStorage } from 'node:async_hooks';
import type { Verdict } from './scenario.js';

export type ExecutionProgress = {
  at: string;
  phase: 'SETUP' | 'EXECUTING' | 'CLEANUP' | 'REPORT';
  label: string;
  result?: Verdict;
};

const listeners = new AsyncLocalStorage<(event: ExecutionProgress) => void>();

export function withExecutionProgress<T>(
  listener: (event: ExecutionProgress) => void,
  execute: () => Promise<T>,
): Promise<T> {
  return listeners.run(listener, execute);
}

// Call only with fixed stage/action identifiers, never RPC outputs or errors.
export function executionProgress(
  phase: ExecutionProgress['phase'],
  label: string,
  result?: Verdict,
) {
  listeners.getStore()?.({
    at: new Date().toISOString(),
    phase,
    label,
    ...(result ? { result } : {}),
  });
}
