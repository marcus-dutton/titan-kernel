import 'reflect-metadata';
import { forwardRef, isForwardRef } from './forward-ref';

export function Inject(token: any) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingTokens = Reflect.getMetadata('self:paramtypes', target) || [];
    existingTokens[parameterIndex] = { token };
    Reflect.defineMetadata('self:paramtypes', existingTokens, target);
  };
}
