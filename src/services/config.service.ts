import { Injectable } from '../decorators/injectable';
import * as fs from 'fs';
import * as path from 'path';

// Default TitanKernel configuration interface
export interface DefaultTitanConfig {
  environment?: string;
  port?: number;
  logging?: {
    level?: string;
    enableConsole?: boolean;
    enableDatabase?: boolean;
  };
  database?: {
    url?: string;
    name?: string;
    options?: any;
  };
  api?: {
    version?: string;
    prefix?: string;
  };
  [key: string]: any; // Allow additional properties
}

@Injectable()
export class ConfigService<T extends DefaultTitanConfig = DefaultTitanConfig> {
  private config: T = {} as T;
  private configLoaded: boolean = false;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    if (this.configLoaded) return;

    try {
      // Try to load from titan.config.json in the current working directory
      const configPath = path.join(process.cwd(), 'titan.config.json');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(configContent);
      }
    } catch (error) {
      console.warn('Could not load titan.config.json:', error);
    }

    // Merge with environment variables
    this.mergeEnvironmentVariables();
    this.configLoaded = true;
  }

  private mergeEnvironmentVariables(): void {
    // Add common environment variables to config
    if (process.env.NODE_ENV) {
      this.config.environment = process.env.NODE_ENV;
    }
    if (process.env.PORT) {
      this.config.port = parseInt(process.env.PORT, 10);
    }
    if (process.env.DATABASE_URL) {
      this.config.database = this.config.database || {};
      this.config.database.url = process.env.DATABASE_URL;
    }
    if (process.env.LOG_LEVEL) {
      this.config.logging = this.config.logging || {};
      this.config.logging.level = process.env.LOG_LEVEL;
    }
  }

  get<K = any>(key: string, defaultValue?: K): K {
    const keys = key.split('.');
    let current: any = this.config;

    for (const k of keys) {
      if (current === null || current === undefined || !(k in current)) {
        return defaultValue as K;
      }
      current = current[k];
    }

    return current as K;
  }

  set(key: string, value: any): void {
    const keys = key.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }

    current[keys[keys.length - 1]] = value;
  }

  getAll(): T {
    return { ...this.config };
  }
}
