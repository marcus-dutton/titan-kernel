import { Injectable } from '../decorators/injectable';
import chalk from 'chalk';
import { Server as SocketIOServer } from 'socket.io';
import { LogLevel } from '../interfaces/logging.interface';
import { LogEntry, LogConfig } from '../models/log.model';
import { Subject, BehaviorSubject, filter } from 'rxjs';

// Re-export LogLevel for external consumers
export { LogLevel };

export interface LoggerConfig {
  databaseAccess?: boolean;
  enableConsole?: boolean;
  enableSocket?: boolean;
  /**
   * The log level to use if the database is not available. Accepts a LogLevel enum value or string (e.g. 'DEBUG', 4).
   * Config key: "logLevel"
   */
  logLevel?: LogLevel | keyof typeof LogLevel | string | number;
}

// Event emitter for log updates
export const logUpdateEmitter = new Subject<void>();

@Injectable()
export class TitanLoggerService {
  private logLevel: LogLevel = LogLevel.NONE;  // Default to NONE (silent)
  public enableVerbose: boolean = false; // Verbose logging toggle
  private socketServer?: SocketIOServer;
  private originalConsole: any = {};
  private logBuffer: LogEntry[] = [];
  private consoleBuffer: string[] = [];  // Unlimited console buffer for large files
  private consoleEnabled: boolean = true;
  private databaseAccess: boolean = false;  // Read from config
  private socketEnabled: boolean = true;
  private consoleCapturingStarted: boolean = false;
  private offlineQueue: LogEntry[] = [];
  private operationQueue: (() => Promise<void>)[] = [];
  
  // New properties for class-specific logging
  private readonly logSubject = new Subject<LogEntry>();
  private readonly dbReady = new BehaviorSubject<boolean>(false);
  private readonly className = this.constructor.name;
  private availableClasses: Set<string> = new Set();
  private enabledClasses: Set<string> = new Set();
  private alwaysEnabledClass: string = 'TitanKernel';
  private eventNamespace: any;
  private ioService: any;
  private container: any;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Read config to get databaseAccess setting
    await this.loadConfigFromFile();
    
    this.captureConsole();
    this.setupDatabaseConnectionWatcher();
    await this.initializeContainer();
    // updateAvailableClassesFromDI should be called after DI is ready (in kernel)
    await this.loadConfigFromDb();
    this.setupOfflineBufferProcessor();
  }

  private async initializeContainer(): Promise<void> {
    // Get container and socket service after delay to avoid circular deps
    setTimeout(() => {
      try {
        // Dynamic import to get container
        import('../core/container').then(({ container }) => {
          this.container = container;
          this.debug(this.className, 'Container reference obtained');
        }).catch(() => {
          // Silently fail if container not available
        });

        // Get socket service from container
        const services = (global as any).titanContainer?.services || new Map();
        const singletons = (global as any).titanContainer?.singletons || new Map();
        
        for (const service of [...services.values(), ...singletons.values()]) {
          if (service?.constructor?.name === 'SocketService') {
            this.ioService = service;
            this.debug(this.className, 'SocketService reference obtained');
            break;
          }
        }
      } catch (err) {
        console.warn('Could not initialize container references:', err);
      }
    }, 500);
  }

  private async loadConfigFromFile(): Promise<void> {
    try {
      // Try to read titan.config.json from project root
      const fs = await import('fs');
      const path = await import('path');
      const configPath = path.join(process.cwd(), 'titan.config.json');
      
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        
        // Read the databaseAccess setting
        this.databaseAccess = config.logging?.databaseAccess ?? false;
        
        // If database access is enabled, auto-upgrade log level at runtime when DB is ready
        if (this.databaseAccess && this.dbReady) {
          this.logLevel = LogLevel.INFO;
        }
      }
    } catch (error) {
      // Config file not found or invalid, use defaults
      console.warn('Could not load titan.config.json, using default logging settings');
    }
  }

  private setupDatabaseConnectionWatcher(): void {
    // Check for database availability periodically
    const checkConnection = () => {
      // Check actual database connection using LogEntry model
      const wasReady = this.dbReady.value;
      const isConnected = this.databaseAccess && LogEntry?.db?.readyState === 1;
      
      this.dbReady.next(isConnected);
      
      if (isConnected && !wasReady) {
        // Database just became ready - auto-upgrade log level if databaseAccess is true
        if (this.databaseAccess && this.logLevel === LogLevel.NONE) {
          this.logLevel = LogLevel.INFO;
          this.info('TitanLogger', '🔧 Auto-configured log level to INFO (database ready)', { level: 'INFO' });
        }
        this.flushQueuedOperations();
      }
    };

    checkConnection();

    // Set up database event listeners if available
    if (LogEntry?.db) {
      LogEntry.db.on('connected', () => {
        this.dbReady.next(true);
        this.flushQueuedOperations();
      });
      LogEntry.db.on('disconnected', () => this.dbReady.next(false));
    }

    setInterval(checkConnection, 30000); // Check every 30 seconds
  }

  private async queueDatabaseOperation(operation: () => Promise<void>): Promise<void> {
    if (this.dbReady.value && this.databaseAccess) {
      await operation();
    } else {
      this.operationQueue.push(operation);
    }
  }

  private async flushQueuedOperations(): Promise<void> {
    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift();
      if (operation) await operation();
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  // Check if a log should be output based on class and level
  // Verbose-aware shouldLog logic
  public shouldLog(level: LogLevel, source: string): boolean {
    // Diagnostic output for log filtering
    // const orange = chalk.hex('#FFA500').bold; // Bright orange
    const inputInfo = `shouldLog called with level=${LogLevel[level]} (${level}), source=${source}, logLevel=${LogLevel[this.logLevel]} (${this.logLevel}), enableVerbose=${this.enableVerbose}, enabledClasses=[${[...this.enabledClasses].join(', ')}]`;
    if (this.enableVerbose) {
      // console.log(chalk.greenBright(`[shouldLog] ${inputInfo} => true (enableVerbose)`));
      return true;
    }
    const classEnabled = this.enabledClasses.has(source) || source === this.alwaysEnabledClass;
    // Only log if logLevel is not NONE (0), and the log's level is less than or equal to the current logLevel
    const result = classEnabled && this.logLevel !== LogLevel.NONE && level <= this.logLevel;
    // console.log(orange(`[shouldLog] ${inputInfo} => ${result}`));
    return result;
  }

  setSocketServer(server: SocketIOServer): void {
    this.socketServer = server;
    this.flushBuffer();
  }

  enableConsole(enabled: boolean = true): void {
    this.consoleEnabled = enabled;
    if (!enabled) {
      this.restoreConsole();
    } else {
      this.captureConsole();
    }
  }


  debug(source: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, source, data);
  }

  verbose(message: string, data?: any): void {
    // Always use 'Verbose' as the source for verbose logs
    this.log(LogLevel.VERBOSE, message, 'Verbose', data);
  }

  info(source: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, message, source, data);
  }

  warn(source: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, message, source, data);
  }

  error(source: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, source, data);
  }

  // Method to force output to both console and capture (for kernel logging)
  logToConsole(level: LogLevel, source: string, message: string, data?: any): void {
    if (!this.shouldLog(level, source)) return;
    const entry = new LogEntry({
      timestamp: new Date(),
      level,
      message,
      data,
      source
    });
    this.addToBuffer(entry);
    this.consoleOutput(entry); // Always output to console
    this.socketOutput(entry);  // Also send to frontend
  }

  private log(level: LogLevel, message: string, source: string, data?: any): void {
    // Only log if shouldLog returns true
    if (!this.shouldLog(level, source)) return;

    const entry = new LogEntry({
      timestamp: new Date(),
      level,
      message,
      data,
      source
    });

    this.addToBuffer(entry);
    this.logSubject.next(entry);
    logUpdateEmitter.next();
    
    // Only output to console if not from console source to prevent recursion
    if (this.consoleEnabled && source !== 'console') {
      this.consoleOutput(entry);
    }
    
    if (this.socketEnabled) {
      this.socketOutput(entry);
    }

    // Database persistence
    if (this.databaseAccess && this.dbReady.value) {
      this.databaseOutput(entry);
    } else if (this.databaseAccess) {
      this.offlineQueue.push(entry);
    }
  }

  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    // No size limit - keep everything for large file support (10MB+)
    // Removed: if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();
  }

  // Add console buffer methods like your original
  public addToConsoleBuffer(message: string): void {
    this.consoleBuffer.push(message);
    // No size restrictions - handle large data
    this.broadcastConsoleOutput(message);
  }

  public transferBuffer(earlyBuffer: string[]): void {
    // console.log(`Transferring ${earlyBuffer.length} early console messages`);
    
    // Add early messages to the beginning - NO SIZE LIMIT!
    this.consoleBuffer = [...earlyBuffer, ...this.consoleBuffer];
    
    // console.log(`Buffer now contains ${this.consoleBuffer.length} total messages`);
    
    // Broadcast transferred logs if socket ready
    if (this.socketServer) {
      const response = {
        success: true,
        data: {
          type: 'console_history',
          buffer: this.consoleBuffer,
          timestamp: new Date().toISOString()
        },
        message: 'Early console logs transferred and broadcasted'
      };
      
      this.socketServer.emit('console_output', response);
    }
  }

  private async consoleOutput(entry: LogEntry): Promise<void> {
    setImmediate(() => {
      // Format timestamp as mm/dd/yyyy: HH:MM:ss
      const dateObj = new Date(entry.timestamp);
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const yyyy = dateObj.getFullYear();
      const HH = String(dateObj.getHours()).padStart(2, '0');
      const MM = String(dateObj.getMinutes()).padStart(2, '0');
      const ss = String(dateObj.getSeconds()).padStart(2, '0');
      const timestamp = chalk.gray(`${mm}/${dd}/${yyyy}: ${HH}:${MM}:${ss}`);
      const source = entry.source ? chalk.cyan(`[${entry.source}]`) : '';
      const levelColor = this.getLevelColor(entry.level);
      const levelText = LogLevel[entry.level].padEnd(5);
      
      let output = `${timestamp} ${levelColor(levelText)} ${source} ${entry.message}`;
      // Only print data if it is not null or undefined
      if (entry.data !== undefined && entry.data !== null) {
        output += '\n' + chalk.greenBright(JSON.stringify(entry.data, null, 2));
      }

      // Use original console to prevent infinite recursion
      if (this.originalConsole.log) {
        this.originalConsole.log(output);
      } else {
        // Fallback if original console is not available
        process.stdout.write(output + '\n');
      }
    });
  }

  private socketOutput(entry: LogEntry): void {
    if (this.socketServer) {
      this.socketServer.emit('log', entry);
    }
  }

  private async databaseOutput(entry: LogEntry): Promise<void> {
    try {
      // Dynamic import to avoid dependency issues if mongoose not installed
      const { LogEntry } = await import('../models/log.model');
      
      await LogEntry.create({
        timestamp: new Date(entry.timestamp),
        level: entry.level,
        message: entry.message,
        data: entry.data,
        source: entry.source
      });
    } catch (error) {
      // Silently fail database logging to prevent logging loops
      console.warn('Failed to save log to database:', error);
    }
  }

  private flushBuffer(): void {
    if (this.socketServer && this.logBuffer.length > 0) {
      this.socketServer.emit('log-batch', this.logBuffer);
    }
  }

  private getLevelColor(level: LogLevel): (text: string) => string {
    switch (level) {
      case LogLevel.DEBUG: return chalk.blue;
      case LogLevel.INFO: return chalk.green;
      case LogLevel.WARN: return chalk.yellow;
      case LogLevel.ERROR: return chalk.red;
      default: return chalk.white;
    }
  }

  private captureConsole(): void {
    if (!this.consoleEnabled) return;

    // Use the new console capture method
    this.startConsoleCapture();
  }

  restoreConsole(): void {
    this.stopConsoleCapture();
  }

  getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  clearBuffer(): void {
    this.logBuffer = [];
  }

  // Console capture methods matching your original design
  private broadcastConsoleOutput(message: string): void {
    if (!this.socketServer) {
      return; // Socket not available yet
    }

    try {
      const response = {
        success: true,
        data: {
          type: 'console_output',
          message: message,
          timestamp: new Date().toISOString(),
          buffer: this.consoleBuffer // Send full buffer
        },
        message: 'Console output broadcasted'
      };

      this.socketServer.emit('console_output', response);
    } catch (err) {
      // Use original console to avoid infinite recursion
      if (this.originalConsole.error) {
        this.originalConsole.error('[TitanLogger] Failed to broadcast console output:', err);
      }
    }
  }

  private formatConsoleArgs(level: string, args: any[]): string {
    const timestamp = new Date().toLocaleString();
    // Use chalk for all coloring
    const levelChalk: Record<string, (msg: string) => string> = {
      log: chalk.white,
      info: chalk.blueBright,
      warn: chalk.yellow,
      error: chalk.red,
      debug: chalk.magenta,
    };

    const colorFn = levelChalk[level] || chalk.white;

    // Format arguments to strings, preserving objects and complex types
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return arg;
      } else if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (err) {
          return String(arg);
        }
      } else {
        return String(arg);
      }
    }).join(' ');

    // Return formatted string with chalk colors
    return `${chalk.gray(`[${timestamp}]`)} ${colorFn(`[${level.toUpperCase()}]`)}: ${formattedArgs}`;
  }

  // Method to start console capturing (matching your original)
  startConsoleCapture(): void {
    if (this.consoleCapturingStarted) {
      return;
    }

    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };

    // Add startup message to buffer
    this.addToConsoleBuffer(`[${new Date().toISOString()}] Console capture started - TitanKernel logging initialized`);

    // Override console methods with formatting like your original
    const shouldSkip = (args: any[]) => {
      // Skip if all args are null, undefined, or empty string
      if (args.length === 0) return true;
      // If all args are null/undefined/empty string, skip
      if (args.every(arg => arg === null || arg === undefined || (typeof arg === 'string' && arg.trim() === ''))) return true;
      // If only one arg and it's exactly 'null' or 'undefined' as a string, skip
      if (args.length === 1 && (args[0] === null || args[0] === undefined)) return true;
      return false;
    };

    console.log = (...args: any[]) => {
      if (shouldSkip(args)) return;
      const formatted = this.formatConsoleArgs('log', args);
      // Only add to buffer if formatted is not just 'null' or 'undefined' (as string)
      if (formatted && formatted.trim() !== 'null' && formatted.trim() !== 'undefined' && formatted.trim() !== `${chalk.gray('[object Object]')}`) {
        this.addToConsoleBuffer(formatted);
      }
      this.originalConsole.log(...args);
    };

    console.info = (...args: any[]) => {
      if (shouldSkip(args)) return;
      const formatted = this.formatConsoleArgs('info', args);
      if (formatted && formatted.trim() !== 'null' && formatted.trim() !== 'undefined' && formatted.trim() !== `${chalk.gray('[object Object]')}`) {
        this.addToConsoleBuffer(formatted);
      }
      this.originalConsole.info(...args);
    };

    console.warn = (...args: any[]) => {
      if (shouldSkip(args)) return;
      const formatted = this.formatConsoleArgs('warn', args);
      if (formatted && formatted.trim() !== 'null' && formatted.trim() !== 'undefined' && formatted.trim() !== `${chalk.gray('[object Object]')}`) {
        this.addToConsoleBuffer(formatted);
      }
      this.originalConsole.warn(...args);
    };

    console.error = (...args: any[]) => {
      if (shouldSkip(args)) return;
      const formatted = this.formatConsoleArgs('error', args);
      if (formatted && formatted.trim() !== 'null' && formatted.trim() !== 'undefined' && formatted.trim() !== `${chalk.gray('[object Object]')}`) {
        this.addToConsoleBuffer(formatted);
      }
      this.originalConsole.error(...args);
    };

    console.debug = (...args: any[]) => {
      if (shouldSkip(args)) return;
      const formatted = this.formatConsoleArgs('debug', args);
      if (formatted && formatted.trim() !== 'null' && formatted.trim() !== 'undefined' && formatted.trim() !== `${chalk.gray('[object Object]')}`) {
        this.addToConsoleBuffer(formatted);
      }
      this.originalConsole.debug(...args);
    };

    this.consoleCapturingStarted = true;
  }

  // Method to stop console capturing and restore original methods
  stopConsoleCapture(): void {
    if (!this.consoleCapturingStarted) {
      return;
    }

    // Restore original console methods
    console.log = this.originalConsole.log as any;
    console.info = this.originalConsole.info as any;
    console.warn = this.originalConsole.warn as any;
    console.error = this.originalConsole.error as any;
    console.debug = this.originalConsole.debug as any;

    this.consoleCapturingStarted = false;
  }

  // Method to get current console buffer
  getConsoleBuffer(): string[] {
    return [...this.consoleBuffer]; // Return a copy
  }

  // Method to clear console buffer
  clearConsoleBuffer(): void {
    this.consoleBuffer = [];
    
    // Broadcast buffer clear event
    if (this.socketServer) {
      const response = {
        success: true,
        data: {
          type: 'console_cleared',
          timestamp: new Date().toISOString()
        },
        message: 'Console buffer cleared'
      };

      this.socketServer.emit('console_clear', response);
    }
  }

  // Methods expected by the kernel
  configure(config: any): void {
    // Handle legacy properties and map them to your simple design
    if (config.enableDatabase !== undefined) {
      this.databaseAccess = config.enableDatabase;
    }
    if (config.databaseAccess !== undefined) {
      this.databaseAccess = config.databaseAccess;
    }
    
    // Handle console settings (always enabled by default in your design)
    if (config.enableConsole !== undefined) {
      this.consoleEnabled = config.enableConsole;
    }
    
    // Handle socket settings (always enabled by default in your design)  
    if (config.enableSocket !== undefined) {
      this.socketEnabled = config.enableSocket;
    }
    
    // If database access is enabled and DB is ready, auto-upgrade log level
    if (this.databaseAccess && this.dbReady && this.logLevel === LogLevel.NONE) {
      this.logLevel = LogLevel.INFO;
      this.info('TitanLogger', '🔧 Auto-configured log level to INFO (database ready)', { level: 'INFO' });
    }
  }

  setDatabaseReady(ready: boolean): void {
    this.dbReady.next(ready);
    
    // Auto-configure log level based on database availability
    // If database is ready and we have database access enabled, upgrade to INFO for better visibility
    if (ready && this.logLevel === LogLevel.NONE && this.databaseAccess) {
      this.logLevel = LogLevel.INFO;
      this.info('TitanLogger', '🔧 Auto-configured log level to INFO (database ready)', { level: 'INFO' });
    }
    
    if (ready) {
      this.flushQueuedOperations();
    }
  }

  // 🔥 Missing method: Load LogConfig from database
  private async loadConfigFromDb(): Promise<void> {
    await this.queueDatabaseOperation(async () => {
      try {
        const config = await LogConfig.findOne({ _id: 'config' }).lean();

        if (config) {
          this.logLevel = config.globalLogLevel;
          this.availableClasses = new Set(config.availableClasses);
          this.enabledClasses = new Set(config.enabledClasses);
          this.availableClasses.add(this.alwaysEnabledClass);
        } else {
          // Create default config
          await LogConfig.create({
            _id: 'config',
            globalLogLevel: LogLevel.NONE,
            availableClasses: [...this.availableClasses, this.alwaysEnabledClass],
            enabledClasses: [this.alwaysEnabledClass],
            uiToggleStates: {},
            lastModified: new Date(),
          });
        }
      } catch (error) {
        console.warn('Failed to load config from database:', error);
      }
    });
  }

  // 🔥 Missing method: Update available classes from DI container
  public async updateAvailableClassesFromDI(): Promise<void> {
    try {
      if (this.container?.findAllClasses) {
        const allClasses = await this.container.findAllClasses();
        const allClassNames = allClasses.map((cls: any) => cls.name);
        this.availableClasses = new Set(allClassNames);
        this.availableClasses.add(this.alwaysEnabledClass);

        this.enabledClasses = new Set(
          Array.from(this.enabledClasses).filter(cls =>
            this.availableClasses.has(cls) || cls === this.alwaysEnabledClass
          )
        );

        // Only add TitanKernel if not already the alwaysEnabledClass
        if (this.alwaysEnabledClass !== 'TitanKernel') {
          this.availableClasses.add('TitanKernel');
        }
        this.availableClasses.add('BootStrapVOID');

        await this.queueDatabaseOperation(async () => {
          await LogConfig.findByIdAndUpdate(
            'config',
            {
              availableClasses: [...this.availableClasses],
              lastModified: new Date(),
            },
            { upsert: true }
          );
        });
      }
    } catch (err) {
      this.error(this.className, 'Failed to update available classes from DI', err);
    }
  }

  // 🔥 Missing method: Setup offline buffer processor
  private setupOfflineBufferProcessor(): void {
    this.dbReady.pipe(
      filter(ready => ready && this.offlineQueue.length > 0)
    ).subscribe(async () => {
      while (this.offlineQueue.length > 0) {
        const batch = this.offlineQueue.splice(0, 100);
        try {
          await LogEntry.insertMany(batch);
          this.broadcastLogs();
        } catch (error) {
          console.error('Failed to process offline queue:', error);
        }
      }
    });
  }

  // 🔥 Missing method: Set global log level
  setGlobalLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(this.className, `Setting globalLogLevel to: ${LogLevel[level]}`);
    this.queueDatabaseOperation(async () => {
      await LogConfig.findByIdAndUpdate('config', {
        globalLogLevel: level,
        lastModified: new Date(),
      });
    });
  }

  // 🔥 Missing method: Enable logging for specific class
  enableLoggingForClass(className: string): void {
    this.enabledClasses.add(className);
    this.info(this.className, `Enabling logging for class: ${className}`);
    this.queueDatabaseOperation(async () => {
      await LogConfig.findByIdAndUpdate('config', {
        $addToSet: { enabledClasses: className },
        lastModified: new Date(),
      });
    });
  }

  // 🔥 Missing method: Disable logging for specific class
  disableLoggingForClass(className: string): void {
    this.enabledClasses.delete(className);
    this.info(this.className, `Disabling logging for class: ${className}`);
    this.queueDatabaseOperation(async () => {
      await LogConfig.findByIdAndUpdate('config', {
        $pull: { enabledClasses: className },
        lastModified: new Date(),
      });
    });
  }

  // 🔥 Missing method: Sync registered classes
  async syncRegisteredClasses(detectedClasses: string[]): Promise<void> {
    this.queueDatabaseOperation(async () => {
      this.availableClasses = new Set(detectedClasses);
      this.availableClasses.add(this.alwaysEnabledClass);

      this.enabledClasses = new Set(
        Array.from(this.enabledClasses).filter(cls =>
          detectedClasses.includes(cls) || cls === this.alwaysEnabledClass
        )
      );

      await LogConfig.findByIdAndUpdate('config', {
        availableClasses: [...this.availableClasses],
        enabledClasses: [...this.enabledClasses],
        lastModified: new Date(),
      });
    });
  }

  // 🔥 Missing method: Broadcast logs to clients
  async broadcastLogs(): Promise<void> {
    try {
      if (!this.eventNamespace || !this.ioService?.emitToAll) return;

      const logs = await LogEntry.find({})
        .sort({ timestamp: -1 })
        .limit(1000);

      const response = {
        success: true,
        data: logs,
        message: 'Logs broadcasted successfully'
      };

      this.ioService.emitToAll(this.eventNamespace.GetLogsResponse, response);
    } catch (err) {
      console.error('Failed to broadcast logs:', err);
    }
  }
}
