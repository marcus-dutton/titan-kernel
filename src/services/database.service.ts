import { Injectable } from '../decorators/injectable';
import * as mongoose from 'mongoose';
import { TitanLoggerService } from './titan-logger.service';

export interface DatabaseConfig {
  type: 'mongo' | 'sql' | (string & {});
  urlProd: string;
  prodName?: string;
  urlDev: string;
  devName?: string;
  useProductionDatabase?: boolean;
  options?: mongoose.ConnectOptions;
}

export interface ModelInfo {
  name: string;
  schema: mongoose.Schema;
  collection?: string;
}

@Injectable()
export class DatabaseService {
  private isConnected: boolean = false;
  private connection?: typeof mongoose;
  private registeredModels: Map<string, mongoose.Model<any>> = new Map();
  private source: string = 'DatabaseService';
  private currentConfig?: DatabaseConfig;
  private reconnectionTimeout?: NodeJS.Timeout;
  private isReconnecting: boolean = false;
  
  constructor(private logger: TitanLoggerService) {}

  async connect(config: DatabaseConfig, retryAttempts: number = 3): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // Store config for automatic reconnection
    this.currentConfig = config;

    const maxRetries = retryAttempts;
    let currentAttempt = 0;

    while (currentAttempt < maxRetries) {
      try {
        const options: mongoose.ConnectOptions = {
          serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
          socketTimeoutMS: 45000,
          maxPoolSize: 10,
          ...config.options
        };
        const url = config.useProductionDatabase ? config.urlProd : config.urlDev;
        
        // Log the connection attempt
        if (currentAttempt > 0) {
          this.logger.info(this.source, `Database connection attempt ${currentAttempt + 1}/${maxRetries}`);
        }
        
        this.logger.verbose(this.source, `Attempting to connect to database with config:`, {
          url,
          options,
          type: config.type,
          attempt: currentAttempt + 1
        });
        
        this.connection = await mongoose.connect(url, options);
        this.isConnected = true;
        
        // Set up connection event listeners (only on first successful connection)
        if (currentAttempt === 0 || !mongoose.connection.listenerCount('disconnected')) {
          mongoose.connection.on('disconnected', () => {
            this.logger.warn(this.source, 'Database disconnected - initiating automatic reconnection');
            this.isConnected = false;
            this.scheduleReconnection();
          });
          
          mongoose.connection.on('error', (error) => {
            this.logger.error(this.source, 'Database connection error:', error);
            this.isConnected = false;
            this.scheduleReconnection();
          });
          
          mongoose.connection.on('reconnected', () => {
            this.logger.info(this.source, 'Database reconnected successfully');
            this.isConnected = true;
            this.isReconnecting = false;
            if (this.reconnectionTimeout) {
              clearTimeout(this.reconnectionTimeout);
              this.reconnectionTimeout = undefined;
            }
          });
        }
        
        const dbName = config.useProductionDatabase ? config.prodName : config.devName;
        this.logger.info(this.source, `Database connected successfully to ${dbName}${currentAttempt > 0 ? ` (after ${currentAttempt + 1} attempts)` : ''}`);
        return; // Success, exit the retry loop
        
      } catch (error: any) {
        currentAttempt++;
        
        if (currentAttempt >= maxRetries) {
          // Final failure
          this.logger.error(this.source, `Database connection failed after ${maxRetries} attempts:`, {
            error: error.message,
            config: { ...config, urlProd: '[REDACTED]', urlDev: '[REDACTED]' }
          });
          this.isConnected = false;
          throw new Error(`Database connection failed after ${maxRetries} attempts: ${error.message}`);
        } else {
          // Retry with exponential backoff
          const delayMs = Math.pow(2, currentAttempt) * 1000; // 2s, 4s, 8s, etc.
          this.logger.warn(this.source, `Database connection attempt ${currentAttempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`, {
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    // Cancel any pending reconnection attempts
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
      this.reconnectionTimeout = undefined;
    }
    
    this.isReconnecting = false;
    
    if (this.isConnected && this.connection) {
      await mongoose.disconnect();
      this.isConnected = false;
      this.logger.info(this.source, 'Database disconnected manually');
    }
  }

  isReady(): boolean {
    if (!this.connection) {
      // Connection is not established or failed
      return false;
    }
    
    try {
      // For Mongoose 8.x, the connection state is on this.connection.connection.readyState,
      // but if undefined, fallback to mongoose.connection.readyState
      const readyState = this.connection.connection?.readyState ?? mongoose.connection.readyState;
      
      // MongoDB connection states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      const isConnectedState = readyState === 1;
      
      // Update our internal state if we detect a disconnection
      if (!isConnectedState && this.isConnected) {
        this.logger.warn(this.source, 'Database connection state changed to disconnected');
        this.isConnected = false;
      }
      
      return this.isConnected && isConnectedState;
    } catch (error) {
      // If we can't even check the connection state, it's definitely not ready
      this.logger.warn(this.source, 'Failed to check database connection state:', error);
      this.isConnected = false;
      return false;
    }
  }

  getConnection(): typeof mongoose | undefined {
    return this.connection;
  }

  async checkModels(retryAttempts: number = 2): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Database is not connected. Cannot check models.');
    }

    let currentAttempt = 0;
    const maxRetries = retryAttempts;

    while (currentAttempt < maxRetries) {
      try {
        // Get all registered models in mongoose
        const existingModels = mongoose.modelNames();
        
        // Validate each model
        for (const modelName of existingModels) {
          const model = mongoose.model(modelName);
          
          // Store in our registry
          this.registeredModels.set(modelName, model);
          
          // Validate model schema (basic validation)
          const schema = model.schema;
          if (!schema) {
            throw new Error(`Model ${modelName} has no valid schema`);
          }
          
          // Check if collection exists and is accessible with timeout
          try {
            await Promise.race([
              model.findOne().limit(1).exec(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Collection access timeout')), 5000)
              )
            ]);
          } catch (error: any) {
            this.logger.warn(this.source, `Warning: Could not access collection for model ${modelName}:`, error.message);
          }
        }
        
        this.logger.info(this.source, `Successfully validated ${existingModels.length} models${currentAttempt > 0 ? ` (after ${currentAttempt + 1} attempts)` : ''}.`);
        this.logger.verbose(this.source, `✅ Validated ${existingModels.length} models:`, existingModels);
        return; // Success, exit retry loop
        
      } catch (error: any) {
        currentAttempt++;
        
        if (currentAttempt >= maxRetries) {
          throw new Error(`Model validation failed after ${maxRetries} attempts: ${error.message}`);
        } else {
          const delayMs = 2000 * currentAttempt; // 2s, 4s delays
          this.logger.warn(this.source, `Model validation attempt ${currentAttempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`, {
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  registerModel(modelInfo: ModelInfo): mongoose.Model<any> {
    try {
      // Check if model already exists
      if (mongoose.models[modelInfo.name]) {
        return mongoose.models[modelInfo.name];
      }

      // Create the model
      const model = mongoose.model(modelInfo.name, modelInfo.schema, modelInfo.collection);
      this.registeredModels.set(modelInfo.name, model);
      
      return model;
    } catch (error: any) {
      throw new Error(`Failed to register model ${modelInfo.name}: ${error.message}`);
    }
  }

  getModel<T = any>(name: string): mongoose.Model<T> | undefined {
    return this.registeredModels.get(name) as mongoose.Model<T>;
  }

  getAllModels(): Map<string, mongoose.Model<any>> {
    return new Map(this.registeredModels);
  }

  getModelNames(): string[] {
    return Array.from(this.registeredModels.keys());
  }

  private scheduleReconnection(delayMs: number = 5000): void {
    if (this.isReconnecting || this.isConnected) {
      return; // Already reconnecting or connected
    }

    // Clear any existing reconnection timeout
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
    }

    this.logger.info(this.source, `Scheduling database reconnection in ${delayMs}ms`);
    this.reconnectionTimeout = setTimeout(() => {
      this.attemptReconnection();
    }, delayMs);
  }

  private async attemptReconnection(attempt: number = 1, maxAttempts: number = 5): Promise<void> {
    if (this.isConnected || !this.currentConfig) {
      return;
    }

    if (this.isReconnecting) {
      return; // Already attempting reconnection
    }

    this.isReconnecting = true;
    this.logger.info(this.source, `Attempting database reconnection (attempt ${attempt}/${maxAttempts})`);

    try {
      // Try to reconnect without triggering the full retry logic
      const options: mongoose.ConnectOptions = {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        ...this.currentConfig.options
      };
      const url = this.currentConfig.useProductionDatabase ? 
        this.currentConfig.urlProd : this.currentConfig.urlDev;

      await mongoose.disconnect(); // Ensure clean disconnect first
      this.connection = await mongoose.connect(url, options);
      this.isConnected = true;
      this.isReconnecting = false;

      const dbName = this.currentConfig.useProductionDatabase ? 
        this.currentConfig.prodName : this.currentConfig.devName;
      this.logger.info(this.source, `Database reconnected successfully to ${dbName} (attempt ${attempt})`);

    } catch (error: any) {
      this.isReconnecting = false;
      
      if (attempt >= maxAttempts) {
        this.logger.error(this.source, `Database reconnection failed after ${maxAttempts} attempts:`, error.message);
        // Schedule another reconnection attempt after a longer delay
        this.scheduleReconnection(30000); // 30 seconds
      } else {
        // Exponential backoff for reconnection attempts
        const nextDelayMs = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s, 32s
        this.logger.warn(this.source, `Reconnection attempt ${attempt} failed. Next attempt in ${nextDelayMs}ms`, {
          error: error.message
        });
        
        setTimeout(() => {
          this.attemptReconnection(attempt + 1, maxAttempts);
        }, nextDelayMs);
      }
    }
  }
}
