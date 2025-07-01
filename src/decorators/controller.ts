import { container } from '../core/container';
import { ServiceType, ControllerOptions } from '../core/types';

export function Controller(path?: string, options?: ControllerOptions): ClassDecorator {
  return function <T extends Function>(target: T): T {
    const controllerOptions = {
      path,
      ...options
    };
    
    container.register(target, ServiceType.CONTROLLER, controllerOptions);
    return target;
  };
}
