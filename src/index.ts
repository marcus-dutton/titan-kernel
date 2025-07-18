import 'reflect-metadata';

// Core exports
export { DIContainer, container } from './core/container';
export * from './core/types';
export { forwardRef, isForwardRef } from './core/forward-ref';
export { Inject } from './core/inject.decorator';
export { LazyProxy } from './core/lazy-proxy';

// Decorators
export { Injectable } from './decorators/injectable';
export { Controller } from './decorators/controller';
export { Gateway } from './decorators/gateway';
export { Module } from './decorators/module';
export { Component } from './decorators/component';

// Services
export { ConfigService } from './services/config.service';
export { TitanLoggerService } from './services/titan-logger.service';
export { DatabaseService } from './services/database.service';
export { SocketService } from './services/socket.service';
export type { DefaultTitanConfig } from './services/config.service';

export type { DatabaseConfig, ModelInfo } from './services/database.service';

// Models
export { LogLevel } from './interfaces/logging.interface';
export type { ILogEntry, ILoggingConfig } from './interfaces/logging.interface';
export { LogEntry } from './models/log.model';
export { LogConfig } from './models/log.model';

// Kernel
export { TitanKernel } from './kernel/titan-kernel';
export type { BootstrapOptions } from './kernel/titan-kernel';

// Utils
export { FileScanner, fileScanner } from './utils/file-scanner';
export { TransformMongoose } from './utils/transform-mongoose';
export type { ToJSONOptions } from './utils/transform-mongoose';

// Lifecycle hooks
// titan-kernel/src/index.ts - ADD:
export { OnInit, OnDestroy, OnApplicationStart, OnApplicationShutdown } from './lifecycle/interfaces';

// Re-export types for convenience
export type {
  ServiceOptions,
  ForwardRef,
  ModuleMetadata,
  ServiceType,
  ServiceMetadata,
  TitanKernelContext,
  ScanOptions,
  ControllerOptions,
  GatewayOptions
} from './core/types';
