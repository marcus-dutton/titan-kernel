import { container } from '../core/container';
import { ServiceType, ModuleMetadata } from '../core/types';

export function Module(metadata: ModuleMetadata): ClassDecorator {
  return function <T extends Function>(target: T): T {
    container.register(target, ServiceType.MODULE, metadata);
    
    // Register providers, controllers, and gateways
    if (metadata.providers) {
      metadata.providers.forEach(provider => {
        if (!container.getAllServices().includes(provider)) {
          container.register(provider, ServiceType.INJECTABLE, {});
        }
      });
    }
    
    if (metadata.controllers) {
      metadata.controllers.forEach(controller => {
        if (!container.getAllServices().includes(controller)) {
          container.register(controller, ServiceType.CONTROLLER, {});
        }
      });
    }
    
    if (metadata.gateways) {
      metadata.gateways.forEach(gateway => {
        if (!container.getAllServices().includes(gateway)) {
          container.register(gateway, ServiceType.GATEWAY, {});
        }
      });
    }
    
    return target;
  };
}
