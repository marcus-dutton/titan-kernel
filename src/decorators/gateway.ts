import { container } from '../core/container';
import { ServiceType, GatewayOptions } from '../core/types';

export function Gateway(options?: GatewayOptions): ClassDecorator {
  return function <T extends Function>(target: T): T {
    container.register(target, ServiceType.GATEWAY, options || {});
    return target;
  };
}
