import { container } from '../core/container';
import { ServiceLifecycle, ServiceType } from '../core/types';

export interface ComponentOptions {
  lifecycle?: ServiceLifecycle;
  tags?: string[];
}

export function Component(options: ComponentOptions = {}): ClassDecorator {
  return function (target: any) {
    container.register(target, ServiceType.COMPONENT, {
      lifecycle: options.lifecycle || ServiceLifecycle.SINGLETON,
      tags: options.tags || []
    });
  };
}
