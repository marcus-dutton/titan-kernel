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
  constructor(private logger: TitanLoggerService) {}

  async connect(config: DatabaseConfig): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const options: mongoose.ConnectOptions = {
        ...config.options
      };
      const url = config.useProductionDatabase ? config.urlProd : config.urlDev;
      // Log the config and url being used for connection
      this.logger.verbose(this.source, `Attempting to connect to database with config:`, {
        url,
        options,
        type: config.type
      });
      this.connection = await mongoose.connect(url, options);
      this.isConnected = true;
      const dbName = config.useProductionDatabase ? config.prodName : config.devName;
      this.logger.info(this.source, `[DatabaseService] Database connected successfully to ${dbName}`);
    } catch (error: any) {
      this.logger.error(this.source, 'Database connection failed:', {
        error,
        config
      });
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected && this.connection) {
      await mongoose.disconnect();
      this.isConnected = false;
    }
  }

  isReady(): boolean {
    if (!this.connection) {
      // Connection is not established or failed
      return false;
    }
    // For Mongoose 8.x, the connection state is on this.connection.connection.readyState,
    // but if undefined, fallback to mongoose.connection.readyState
    const readyState = this.connection.connection?.readyState;
    return this.isConnected && readyState === 1;
  }

  getConnection(): typeof mongoose | undefined {
    return this.connection;
  }

  async checkModels(): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Database is not connected. Cannot check models.');
    }

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
        
        // Check if collection exists and is accessible
        try {
          await model.findOne().limit(1).exec();
        } catch (error: any) {
          this.logger.warn(this.source, `Warning: Could not access collection for model ${modelName}:`, error.message);
        }
      }
      this.logger.info(this.source, `Successfully validated ${existingModels.length} models.`);
      this.logger.verbose(this.source,`✅ Validated ${existingModels.length} models:`, existingModels);
      
    } catch (error: any) {
      throw new Error(`Model validation failed: ${error.message}`);
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
}
