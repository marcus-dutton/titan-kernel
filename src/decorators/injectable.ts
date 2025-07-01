import { container } from '../core/container';
import { ServiceType } from '../core/types';

export interface InjectableOptions {
  providedIn?: 'root' | 'singleton' | 'transient';
}

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return function <T extends Function>(target: T): T {
    container.register(target, ServiceType.INJECTABLE, options);
    return target;
  };
}
