import 'reflect-metadata';
import { ServiceMetadata, ServiceType, ServiceOptions } from './types';
import { LazyProxy } from './lazy-proxy';
import { isForwardRef } from './forward-ref';

export class DIContainer {
  private services = new Map<string, any>();
  private metadata = new Map<any, ServiceMetadata>();
  private instances = new Map<any, any>();

  register(target: any, type: ServiceType, options: any = {}): void {
    const metadata: ServiceMetadata = { type, target, options };
    this.metadata.set(target, metadata);
    this.services.set(target.name, target);
  }

  resolve<T>(target: any): T {
    if (this.instances.has(target)) {
      return this.instances.get(target);
    }

    const metadata = this.metadata.get(target);
    if (!metadata) {
      throw new Error(`Service ${target.name} not found. Did you forget to add @Injectable()?`);
    }

    const dependencies = this.resolveDependencies(target);
    const instance = new target(...dependencies);
    
    this.instances.set(target, instance);
    return instance;
  }

  private resolveDependencies(target: any): any[] {
    const paramTypes = Reflect.getMetadata('design:paramtypes', target) || [];
    const paramDecorators = Reflect.getMetadata('self:paramtypes', target) || [];

    return paramTypes.map((paramType: any, index: number) => {
      const decorator = paramDecorators[index];
      
      if (decorator && decorator.token) {
        if (isForwardRef(decorator.token)) {
          return new LazyProxy(() => this.resolve(decorator.token.forwardRef()));
        }
        return this.resolve(decorator.token);
      }

      if (isForwardRef(paramType)) {
        return new LazyProxy(() => this.resolve(paramType.forwardRef()));
      }

      if (this.hasCircularDependency(target, paramType)) {
        return new LazyProxy(() => this.resolve(paramType));
      }

      return this.resolve(paramType);
    });
  }

  private hasCircularDependency(target: any, dependency: any): boolean {
    const dependencyParams = Reflect.getMetadata('design:paramtypes', dependency) || [];
    return dependencyParams.includes(target);
  }

  getAllServices(): any[] {
    return Array.from(this.services.values());
  }

  getInjectables(): ServiceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.type === ServiceType.INJECTABLE);
  }

  getControllers(): ServiceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.type === ServiceType.CONTROLLER);
  }

  getGateways(): ServiceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.type === ServiceType.GATEWAY);
  }

  getModules(): ServiceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.type === ServiceType.MODULE);
  }

  getInjectableClasses(): any[] {
    return this.getInjectables().map(m => m.target);
  }

  getControllerClasses(): any[] {
    return this.getControllers().map(m => m.target);
  }

  getGatewayClasses(): any[] {
    return this.getGateways().map(m => m.target);
  }

  /**
   * Returns all @Component classes registered in the DI container.
   */
  getComponentClasses(): any[] {
    return this.getComponents().map(m => m.target);
  }

  /**
   * Returns all DI-managed classes: injectables, controllers, gateways, modules, and components.
   */
  findAllClasses(): any[] {
    const all = [
      ...this.getInjectableClasses(),
      ...this.getControllerClasses(),
      ...this.getGatewayClasses(),
      ...this.getModules().map((m: any) => m.target),
      ...this.getComponentClasses()
    ];
    // Remove duplicates (in case a class is registered under multiple types)
    return Array.from(new Set(all));
  }

  getComponents(): ServiceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.type === ServiceType.COMPONENT);
  }
}

export const container = new DIContainer();
