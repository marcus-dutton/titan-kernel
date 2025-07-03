import 'reflect-metadata';
import { container } from '../core/container';
import { TitanKernelContext, ScanOptions } from '../core/types';
import { ConfigService } from '../services/config.service';
import { TitanLoggerService, LogLevel, LoggerConfig } from '../services/titan-logger.service';
import { DatabaseService, DatabaseConfig } from '../services/database.service';
import { SocketService } from '../services/socket.service';
import { fileScanner } from '../utils/file-scanner';

export interface BootstrapOptions {
  autoScan?: boolean;
  scanOptions?: ScanOptions;
  configPath?: string;
  database?: DatabaseConfig;
  logging?: LoggerConfig;
}

export class TitanKernel {
  private config: ConfigService;
  private logger: TitanLoggerService;
  private database?: DatabaseService;
  private socket: SocketService;

  constructor() {
    // Register core services first
    this.config = container.resolve(ConfigService);
    this.logger = container.resolve(TitanLoggerService);
    this.socket = container.resolve(SocketService);
  }

  async bootstrap(options: BootstrapOptions = {}): Promise<TitanKernelContext> {
    const {
      autoScan = true,
      scanOptions = {},
      database,
      logging: loggerConfig
    } = options;

    // Configure logger early: set log level from config if present, else DEBUG (4)
    let initialLogLevel = LogLevel.DEBUG;
    if (loggerConfig && typeof loggerConfig.logLevel === 'number') {
      initialLogLevel = loggerConfig.logLevel as LogLevel;
    } else if (loggerConfig && typeof loggerConfig.logLevel === 'string') {
      const logLevelKey = loggerConfig.logLevel.toUpperCase() as keyof typeof LogLevel;
      if (LogLevel[logLevelKey] !== undefined) {
        initialLogLevel = LogLevel[logLevelKey] as LogLevel;
      }
    }
    this.logger.configure({ ...loggerConfig, logLevel: initialLogLevel });

    // Log level is now managed internally by TitanLogger based on config and database readiness
    // When DB config loads, it will override this if available
    this.logger.info('TitanKernel', `TitanKernel bootstrap started (logLevel: ${LogLevel[this.logger.getLogLevel()]} = ${this.logger.getLogLevel()})`);


    // Always require explicit database config to initialize database
    if (database) {
      await this.initializeDatabase(database);
    }

    // Optionally enable verbose logging for file lists and similar details
    if (options && (options as any).enableVerbose === true) {
      this.logger.enableVerbose = true;
    }

    // Auto-scan for services if enabled
    if (autoScan) {
      this.logger.debug('TitanKernel', 'Starting auto-scan for services...');
      const scannedFiles = await fileScanner.scanForClasses(scanOptions);
      this.logger.info('TitanKernel', `Scanned ${scannedFiles.length} files`);
      this.logger.verbose('Scanned files detail', { files: scannedFiles });
    }

    // Log discovered services
    const services = container.getAllServices();
    this.logger.info('TitanKernel', `Discovered ${services.length} services`, {
      injectables: container.getInjectables().length,
      controllers: container.getControllers().length,
      gateways: container.getGateways().length,
      modules: container.getModules().length
    });

    this.logger.info('TitanKernel', 'SocketService available for Socket.IO integration', {
      socketReady: this.socket.isReady(),
      note: 'Use context.socket.setServer(io) to initialize Socket.IO server'
    });


    // --- Ensure available classes are updated after DI and DB are ready ---
    if (!database || (this.database && this.database.isReady())) {
      await this.logger.updateAvailableClassesFromDI();
    } else {
      // If DB is not configured or not ready, still update from DI
      await this.logger.updateAvailableClassesFromDI();
    }

    const context: TitanKernelContext = {
      container,
      config: this.config,
      logger: this.logger,
      database: this.database,
      socket: this.socket,
      services: new Map(),
      controllers: container.getControllerClasses(),
      gateways: container.getGatewayClasses(),
      modules: container.getModules().map(m => m.target),
      components: container.getComponentClasses()
    };

    // Populate services map
    for (const service of container.getInjectableClasses()) {
      const instance = container.resolve(service);
      context.services.set(service.name, instance);
    }

    // VERBOSE LOG: TitanKernel context after bootstrap
    this.logger.verbose('TitanKernel context after bootstrap', {
      keys: Object.keys(context),
      context: {
        ...context,
        // Avoid circular references and large objects in logs if needed
        services: Array.from(context.services.keys()),
        controllers: context.controllers,
        gateways: context.gateways,
        modules: context.modules,
        components: context.components
      }
    });

    // Execute OnInit lifecycle hooks on DI-managed instances
    this.logger.debug('TitanKernel', 'Executing OnInit lifecycle hooks...');
    for (const service of services) {
      const instance = container.resolve(service);
      if (instance && typeof (instance as any).onInit === 'function') {
        try {
          await (instance as any).onInit();
          this.logger.debug('TitanKernel', `OnInit completed for ${service.name || instance.constructor.name}`);
        } catch (error: any) {
          this.logger.error('TitanKernel', `OnInit failed for ${service.name || instance.constructor.name}`, { error: error.message });
        }
      }
    }

    // Only log this summary at VERBOSE level
    this.logger.verbose('TitanKernel bootstrap completed', {
      servicesCount: context.services.size,
      controllersCount: context.controllers.length,
      gatewaysCount: context.gateways.length,
      socketServiceReady: this.socket.isReady()
    });

    return context;
  }

  private async initializeDatabase(databaseConfig?: DatabaseConfig): Promise<void> {
    try {
      this.database = container.resolve(DatabaseService);

      if (!databaseConfig || !databaseConfig.type) {
        throw new Error('Database configuration with explicit type (e.g., "type: mongo" or "type: sql") is required.');
      }

      // Show the resolved config for debugging
      this.logger.info('TitanKernel', 'Resolved database config');
      this.logger.verbose('Database config detail', databaseConfig);

      // Example: Only support mongo for now

      if (databaseConfig.type !== 'mongo') {
        throw new Error(`Unsupported database type: ${databaseConfig.type}. Only "mongo" is currently supported.`);
      }

      const useProd = databaseConfig.useProductionDatabase;
      const url = useProd ? databaseConfig.urlProd : databaseConfig.urlDev;

      if (!url) {
        this.logger.warn('TitanKernel', 'No database URL provided, skipping database initialization');
        return;
      }

      this.logger.info('TitanKernel', 'Connecting to database...', { url });

      await this.database.connect(databaseConfig);

      // Notify logger that database is ready
      this.logger.setDatabaseReady(this.database.isReady());


      // Check and validate models
      try {
        await this.database.checkModels();
        this.logger.info('TitanKernel', 'Database models validated successfully');
      } catch (error: any) {
        this.logger.warn('TitanKernel', 'Model validation warning', { error: error.message });
      }

      this.logger.info('TitanKernel', 'Database connected successfully');
    } catch (error: any) {
      this.logger.error('TitanKernel', 'Database connection failed', { error: error.message });
      // Don't throw - allow kernel to continue without database
    }
  }

  static async create(options?: BootstrapOptions): Promise<TitanKernelContext> {
    const kernel = new TitanKernel();
    return await kernel.bootstrap(options);
  }
}
