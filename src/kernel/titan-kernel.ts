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
  private readonly source = 'TitanKernel'; // Single source of truth for logging
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

    // Configure logger early - simplified configuration
    if (loggerConfig) {
      this.logger.configure(loggerConfig);
    } else {
      this.logger.configure({
        databaseAccess: false // Default to false unless explicitly enabled
      });
    }

    // Log level is now managed internally by TitanLogger based on config and database readiness
    this.logger.info(this.source, 'TitanKernel bootstrap started');

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
      this.logger.debug(this.source, 'Starting auto-scan for services...');

      // Detect if we're in a bundled environment
      const isBundled = this.detectBundledEnvironment();

      if (isBundled) {
        // In bundled mode, classes are already loaded and registered
        // Just log that we're skipping file scanning
        this.logger.debug(this.source, 'Bundled environment detected - classes already loaded via bundle execution');
        this.logger.info(this.source, 'Scanned 0 files (bundled mode)');
      } else {
        // In development mode, scan files normally to load and register classes
        this.logger.debug(this.source, 'File system scanning mode');
        const scannedFiles = await fileScanner.scanForClasses(scanOptions);
        this.logger.info(this.source, `Scanned ${scannedFiles.length} files`);
        this.logger.verbose(this.source, 'Scanned files detail', { files: scannedFiles });
      }
    }

    // Log discovered services - use verbose for detailed counts
    const services = container.getAllServices();
    this.logger.info(this.source, `Discovered ${services.length} services`);
    this.logger.verbose(this.source, 'Service discovery details', {
      injectables: container.getInjectables().length,
      controllers: container.getControllers().length,
      gateways: container.getGateways().length,
      modules: container.getModules().length
    });

    this.logger.verbose(this.source, 'SocketService available for Socket.IO integration', {
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

    // Execute OnInit lifecycle hooks on DI-managed instances
    this.logger.debug(this.source, 'Executing OnInit lifecycle hooks...');
    for (const service of services) {
      const instance = container.resolve(service);
      if (instance && typeof (instance as any).onInit === 'function') {
        try {
          await (instance as any).onInit();
          this.logger.debug(this.source, `OnInit completed for ${service.name || instance.constructor.name}`);
        } catch (error: any) {
          this.logger.error(this.source, `OnInit failed for ${service.name || instance.constructor.name}`, { error: error.message });
        }
      }
    }

    // Final summary - info for key metrics, verbose for detailed breakdown
    this.logger.info(this.source, 'TitanKernel bootstrap completed');
    this.logger.verbose(this.source, 'Bootstrap completion details', {
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

      // Show the resolved config for debugging - verbose only
      this.logger.verbose(this.source, 'Resolved database config', databaseConfig);

      // Example: Only support mongo for now
      if (databaseConfig.type !== 'mongo') {
        throw new Error(`Unsupported database type: ${databaseConfig.type}. Only "mongo" is currently supported.`);
      }

      const useProd = databaseConfig.useProductionDatabase;
      const url = useProd ? databaseConfig.urlProd : databaseConfig.urlDev;
      if (!url) {
        this.logger.warn(this.source, 'No database URL provided, skipping database initialization');
        return;
      }

      this.logger.info(this.source, 'Connecting to database...');
      this.logger.verbose(this.source, 'Database connection details', { url });

      await this.database.connect(databaseConfig);

      // Notify logger that database is ready
      this.logger.setDatabaseReady(this.database.isReady());

      // Check and validate models
      try {
        await this.database.checkModels();
        this.logger.info(this.source, 'Database models validated successfully');
      } catch (error: any) {
        this.logger.warn(this.source, 'Model validation warning', { error: error.message });
      }

      this.logger.info(this.source, 'Database connected successfully');
    } catch (error: any) {
      this.logger.error(this.source, 'Database connection failed', { error: error.message });
      // Don't throw - allow kernel to continue without database
    }
  }

  static async create(options?: BootstrapOptions): Promise<TitanKernelContext> {
    const kernel = new TitanKernel();
    return await kernel.bootstrap(options);
  }

  private detectBundledEnvironment(): boolean {
    const mainFilename = require.main?.filename || '';
    const isBundled = mainFilename.endsWith('.js') &&
      !mainFilename.includes('node_modules') &&
      !mainFilename.includes('ts-node');

    this.logger.debug(this.source, 'Environment detection', {
      mainFilename,
      isBundled,
      nodeEnv: process.env.NODE_ENV
    });

    return isBundled;
  }
}