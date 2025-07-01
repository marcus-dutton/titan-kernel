export class LazyProxy<T = any> {
  private _instance?: T;
  private _factory: () => T;

  constructor(factory: () => T) {
    this._factory = factory;
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop === '_getInstance') {
          return () => target._getInstance();
        }
        
        if (!target._instance) {
          target._instance = target._factory();
        }
        
        const value = (target._instance as any)[prop];
        return typeof value === 'function' ? value.bind(target._instance) : value;
      },
      
      set: (target, prop, value) => {
        if (!target._instance) {
          target._instance = target._factory();
        }
        
        (target._instance as any)[prop] = value;
        return true;
      }
    }) as any;
  }

  private _getInstance(): T {
    if (!this._instance) {
      this._instance = this._factory();
    }
    return this._instance;
  }
}
