import { Injectable } from '../decorators/injectable';
import chalk from 'chalk';
import { Server as SocketIOServer } from 'socket.io';

export enum LogLevel {
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
  enableDatabase?: boolean;
  enableConsole?: boolean;
  enableSocket?: boolean;
  maxBufferSize?: number;
}

@Injectable()
export class TitanLoggerService {
  private logLevel: LogLevel = LogLevel.INFO;
  private socketServer?: SocketIOServer;
  private originalConsole: any = {};
  private logBuffer: LogEntry[] = [];
  private maxBufferSize: number = 1000;
  private consoleEnabled: boolean = true;
  private databaseEnabled: boolean = false;
  private socketEnabled: boolean = true;
  private dbReady: boolean = false;

  constructor() {
    this.captureConsole();
  }

  configure(config: LoggerConfig): void {
    this.databaseEnabled = config.enableDatabase ?? false;
    this.consoleEnabled = config.enableConsole ?? true;
    this.socketEnabled = config.enableSocket ?? true;
    this.maxBufferSize = config.maxBufferSize ?? 1000;
    
    if (!this.consoleEnabled) {
      this.restoreConsole();
    } else {
      this.captureConsole();
    }
  }

  setDatabaseReady(ready: boolean): void {
    this.dbReady = ready;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
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
    if (level < this.logLevel) return;

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

    if (this.databaseEnabled && this.dbReady) {
      this.databaseOutput(entry);
    }
  }

  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
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

    // Only capture if we haven't already
    if (Object.keys(this.originalConsole).length > 0) return;

    // Store original console methods with proper binding
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console)
    };

    // Override console methods to capture for frontend
    console.log = (...args) => {
      // Send to buffer and socket (for frontend) but don't output to console to avoid recursion
      this.log(LogLevel.INFO, args.join(' '), undefined, 'console');
    };

    console.warn = (...args) => {
      this.log(LogLevel.WARN, args.join(' '), undefined, 'console');
    };

    console.error = (...args) => {
      this.log(LogLevel.ERROR, args.join(' '), undefined, 'console');
    };

    console.info = (...args) => {
      this.log(LogLevel.INFO, args.join(' '), undefined, 'console');
    };
  }

  restoreConsole(): void {
    if (Object.keys(this.originalConsole).length > 0) {
      Object.assign(console, this.originalConsole);
    }
  }

  getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  clearBuffer(): void {
    this.logBuffer = [];
  }
}
