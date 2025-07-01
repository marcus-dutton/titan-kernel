import { ForwardRef } from './types';

export function forwardRef<T>(fn: () => new (...args: any[]) => T): ForwardRef<T> {
  return {
    __forward_ref__: true,
    forwardRef: fn
  };
}

export function isForwardRef(value: any): value is ForwardRef {
  return value && value.__forward_ref__ === true && typeof value.forwardRef === 'function';
}
