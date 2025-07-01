import { Injectable } from '../decorators/injectable';
import chalk from 'chalk';
import { Server as SocketIOServer } from 'socket.io';

export enum LogLevel {
  NONE = -1,
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  source?: string;
}

export interface LoggerConfig {
  databaseAccess?: boolean;
}

@Injectable()
export class TitanLoggerService {
  private logLevel: LogLevel = LogLevel.NONE;  // Default to NONE (silent)
  private socketServer?: SocketIOServer;
  private originalConsole: any = {};
  private logBuffer: LogEntry[] = [];
  private consoleBuffer: string[] = [];  // Unlimited console buffer for large files
  private consoleEnabled: boolean = true;
  private databaseAccess: boolean = false;  // Read from config
  private socketEnabled: boolean = true;
  private dbReady: boolean = false;
  private consoleCapturingStarted: boolean = false;
  private offlineQueue: LogEntry[] = [];
  private operationQueue: (() => Promise<void>)[] = [];

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Read config to get databaseAccess setting
    await this.loadConfigFromFile();
    
    this.captureConsole();
    this.setupDatabaseConnectionWatcher();
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
      // This would be connected to actual database connection
      // For now, assume database is ready if databaseAccess is enabled
      const wasReady = this.dbReady;
      this.dbReady = this.databaseAccess; // Simplified for now
      
      if (this.dbReady && !wasReady) {
        // Database just became ready - auto-upgrade log level if databaseAccess is true
        if (this.databaseAccess && this.logLevel === LogLevel.NONE) {
          this.logLevel = LogLevel.INFO;
          this.info('🔧 Auto-configured log level to INFO (database ready)', { level: 'INFO' }, 'TitanLogger');
        }
        this.flushQueuedOperations();
      }
    };

    checkConnection();
    setInterval(checkConnection, 30000); // Check every 30 seconds
  }

  private async queueDatabaseOperation(operation: () => Promise<void>): Promise<void> {
    if (this.dbReady && this.databaseAccess) {
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

  // Check if a log level should be output based on current setting
  private shouldLog(level: LogLevel): boolean {
    return this.logLevel !== LogLevel.NONE && level >= this.logLevel;
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

  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, data, source);
  }

  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, message, data, source);
  }

  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, message, data, source);
  }

  error(message: string, data?: any, source?: string): void {
    this.log(LogLevel.ERROR, message, data, source);
  }

  // Method to force output to both console and capture (for kernel logging)
  logToConsole(level: LogLevel, message: string, data?: any, source?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      source
    };

    this.addToBuffer(entry);
    this.consoleOutput(entry); // Always output to console
    this.socketOutput(entry);  // Also send to frontend
  }

  private log(level: LogLevel, message: string, data?: any, source?: string): void {
    // Use the new shouldLog method for better control
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      source
    };

    this.addToBuffer(entry);
    
    // Only output to console if not from console source to prevent recursion
    if (this.consoleEnabled && source !== 'console') {
      this.consoleOutput(entry);
    }
    
    if (this.socketEnabled) {
      this.socketOutput(entry);
    }

    // Database persistence when enabled and ready
    if (this.databaseAccess && this.dbReady) {
      this.databaseOutput(entry);
    } else if (this.databaseAccess) {
      // Queue for later if database not ready
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
    console.log(`Transferring ${earlyBuffer.length} early console messages`);
    
    // Add early messages to the beginning - NO SIZE LIMIT!
    this.consoleBuffer = [...earlyBuffer, ...this.consoleBuffer];
    
    console.log(`Buffer now contains ${this.consoleBuffer.length} total messages`);
    
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

  private consoleOutput(entry: LogEntry): void {
    const timestamp = chalk.gray(entry.timestamp);
    const source = entry.source ? chalk.cyan(`[${entry.source}]`) : '';
    const levelColor = this.getLevelColor(entry.level);
    const levelText = LogLevel[entry.level].padEnd(5);
    
    let output = `${timestamp} ${levelColor(levelText)} ${source} ${entry.message}`;
    
    if (entry.data !== undefined) {
      output += '\n' + chalk.gray(JSON.stringify(entry.data, null, 2));
    }

    // Use original console to prevent infinite recursion
    if (this.originalConsole.log) {
      this.originalConsole.log(output);
    } else {
      // Fallback if original console is not available
      process.stdout.write(output + '\n');
    }
  }

  private socketOutput(entry: LogEntry): void {
    if (this.socketServer) {
      this.socketServer.emit('log', entry);
    }
  }

  private async databaseOutput(entry: LogEntry): Promise<void> {
    try {
      // Dynamic import to avoid dependency issues if mongoose not installed
      const { LogModel } = await import('../models/log.model');
      
      await LogModel.create({
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
    const levelColors: Record<string, string> = {
      log: '\x1b[0m',    // No color for log
      info: '\x1b[94m',  // Bright blue
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
      debug: '\x1b[95m', // Magenta
    };

    const color = levelColors[level] || '\x1b[0m';
    const resetColor = '\x1b[0m';

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

    // Return formatted string with ANSI colors preserved
    return `${color}[${timestamp}] [${level.toUpperCase()}]: ${formattedArgs}${resetColor}`;
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
    console.log = (...args: any[]) => {
      const formatted = this.formatConsoleArgs('log', args);
      this.addToConsoleBuffer(formatted);
      this.originalConsole.log(...args);
    };

    console.info = (...args: any[]) => {
      const formatted = this.formatConsoleArgs('info', args);
      this.addToConsoleBuffer(formatted);
      this.originalConsole.info(...args);
    };

    console.warn = (...args: any[]) => {
      const formatted = this.formatConsoleArgs('warn', args);
      this.addToConsoleBuffer(formatted);
      this.originalConsole.warn(...args);
    };

    console.error = (...args: any[]) => {
      const formatted = this.formatConsoleArgs('error', args);
      this.addToConsoleBuffer(formatted);
      this.originalConsole.error(...args);
    };

    console.debug = (...args: any[]) => {
      const formatted = this.formatConsoleArgs('debug', args);
      this.addToConsoleBuffer(formatted);
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
      this.info('🔧 Auto-configured log level to INFO (database ready)', { level: 'INFO' }, 'TitanLogger');
    }
  }

  setDatabaseReady(ready: boolean): void {
    this.dbReady = ready;
    
    // Auto-configure log level based on database availability
    // If database is ready and we have database access enabled, upgrade to INFO for better visibility
    if (ready && this.logLevel === LogLevel.NONE && this.databaseAccess) {
      this.logLevel = LogLevel.INFO;
      this.info('🔧 Auto-configured log level to INFO (database ready)', { level: 'INFO' }, 'TitanLogger');
    }
    
    if (ready) {
      this.flushQueuedOperations();
    }
  }
}
