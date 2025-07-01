import 'reflect-metadata';
import { container } from '../core/container';
import { TitanKernelContext, ScanOptions } from '../core/types';
import { ConfigService } from '../services/config.service';
import { TitanLoggerService, LogLevel, LoggerConfig } from '../services/titan-logger.service';
import { DatabaseService, DatabaseConfig } from '../services/database.service';
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

  constructor() {
    // Register core services first
    this.config = container.resolve(ConfigService);
    this.logger = container.resolve(TitanLoggerService);
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

    this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', 'TitanKernel bootstrap started');

    // Initialize database if configuration is provided
    if (database || this.config.get('database.url')) {
      await this.initializeDatabase(database);
    }

    // Auto-scan for services if enabled
    if (autoScan) {
      this.logger.logToConsole(LogLevel.DEBUG, 'TitanKernel', 'Starting auto-scan for services...');
      const scannedFiles = await fileScanner.scanForClasses(scanOptions);
      this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', `Scanned ${scannedFiles.length} files`, { files: scannedFiles });
    }

    // Log discovered services
    const services = container.getAllServices();
    this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', `Discovered ${services.length} services`, {
      injectables: container.getInjectables().length,
      controllers: container.getControllers().length,
      gateways: container.getGateways().length,
      modules: container.getModules().length
    });

    const context: TitanKernelContext = {
      container,
      config: this.config,
      logger: this.logger,
      database: this.database,
      services: new Map(),
      controllers: container.getControllerClasses(),
      gateways: container.getGatewayClasses(),
      modules: container.getModules().map(m => m.target)
    };

    // Populate services map
    for (const service of container.getInjectableClasses()) {
      const instance = container.resolve(service);
      context.services.set(service.name, instance);
    }

    this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', 'TitanKernel bootstrap completed', {
      servicesCount: context.services.size,
      controllersCount: context.controllers.length,
      gatewaysCount: context.gateways.length
    });

    return context;
  }

  private async initializeDatabase(databaseConfig?: DatabaseConfig): Promise<void> {
    try {
      this.database = container.resolve(DatabaseService);
      
      // Use provided config or get from config service
      const config = databaseConfig || {
        url: this.config.get('database.url'),
        name: this.config.get('database.name'),
        options: this.config.get('database.options', {})
      };

      if (!config.url) {
        this.logger.logToConsole(LogLevel.WARN, 'TitanKernel', 'No database URL provided, skipping database initialization');
        return;
      }

      this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', 'Connecting to database...', { url: config.url });
      
      await this.database.connect(config);
      
      // Notify logger that database is ready
      this.logger.setDatabaseReady(this.database.isReady());
      
      // Check and validate models
      try {
        await this.database.checkModels();
        this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', 'Database models validated successfully');
      } catch (error: any) {
        this.logger.logToConsole(LogLevel.WARN, 'TitanKernel', 'Model validation warning', { error: error.message });
      }
      
      this.logger.logToConsole(LogLevel.INFO, 'TitanKernel', 'Database connected successfully');
    } catch (error: any) {
      this.logger.logToConsole(LogLevel.ERROR, 'TitanKernel', 'Database connection failed', { error: error.message });
      // Don't throw - allow kernel to continue without database
    }
  }

  static async create(options?: BootstrapOptions): Promise<TitanKernelContext> {
    const kernel = new TitanKernel();
    return await kernel.bootstrap(options);
  }
}
