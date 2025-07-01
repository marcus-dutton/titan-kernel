export interface ServiceOptions {
  providedIn?: 'root' | 'singleton' | 'transient';
  factory?: () => any;
}

export interface ForwardRef<T = any> {
  __forward_ref__: true;
  forwardRef: () => new (...args: any[]) => T;
}

export interface ModuleMetadata {
  providers?: Array<any>;
  imports?: Array<any>;
  exports?: Array<any>;
  controllers?: Array<any>;
  gateways?: Array<any>;
}

export enum ServiceType {
  INJECTABLE = 'injectable',
  CONTROLLER = 'controller',
  GATEWAY = 'gateway',
  MODULE = 'module'
}

export interface ServiceMetadata {
  type: ServiceType;
  target: any;
  options: any;
}

export interface TitanKernelContext {
  container: any;
  config: any;
  logger: any;
  database?: any;
  services: Map<string, any>;
  controllers: any[];
  gateways: any[];
  modules: any[];
}

export interface ScanOptions {
  include?: string[];
  exclude?: string[];
  baseDir?: string;
}

export interface ControllerOptions {
  path?: string;
  middleware?: any[];
  version?: string;
}

export interface GatewayOptions {
  namespace?: string;
  cors?: boolean | object;
  transports?: string[];
}
