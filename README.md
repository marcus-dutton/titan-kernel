# TitanKernel 🚀

Angular-inspired modular backend kernel for Node.js with full dependency injection, circular dependency support, and automatic class scanning.

**Repository:** [https://github.com/marcus-dutton/titan-kernel](https://github.com/marcus-dutton/titan-kernel)

## ⚠️ Important: Bundling Not Supported

**TitanKernel does not support bundling.** The automatic class discovery feature relies on file system scanning and will not work with bundled applications (webpack, vite, rollup, etc.).

**Recommended approach:**
- Use TitanKernel for development and production environments **without bundling**
- Use build tools for TypeScript compilation, minification, and optimization
- Deploy the compiled JavaScript files directly without bundling

If you need bundling for your application, you'll need to manually register all your services, controllers, and gateways instead of relying on auto-discovery.

## Features

- ✅ **Angular-style Dependency Injection** - Full constructor injection with access modifiers
- ✅ **Circular Dependency Support** - Lazy proxies handle complex dependency chains  
- ✅ **Automatic Class Scanning** - Zero-config service discovery via file system scanning
- ✅ **Multiple Decorator Types** - @Injectable, @Controller, @Gateway, @Module, @Component
- ✅ **Enterprise Logging** - Advanced logger with class-based controls, data normalization, and real-time broadcasting
- ✅ **Robust Database Integration** - MongoDB with automatic reconnection, retry logic, and connection state monitoring
- ✅ **Smart Event Handling** - Connection-specific database event listeners with automatic recovery
- ✅ **Mongoose Utilities** - TransformMongoose for consistent JSON transformations
- ✅ **Configuration Management** - Flexible config loading from multiple sources
- ✅ **TypeScript Native** - Full type safety and decorator support
- ✅ **Enhanced Module System** - Hierarchical module organization with dependency management
- ✅ **Performance Optimized** - Improved service resolution and memory efficiency
- ✅ **Developer Experience** - Enhanced debugging and error handling capabilities

## What's New in v1.8.5 🎉

- **🔗 Robust Database Connectivity** - Enhanced connection retry logic with exponential backoff and automatic reconnection
- **🔄 Smart Event Listeners** - Improved database event handling with connection-specific monitoring
- **⚡ Connection State Management** - Better database state tracking and graceful fallback handling
- **🛡️ Enhanced Error Recovery** - Automatic reconnection on network drops with intelligent retry strategies
- **📊 Improved Logging** - Better log level filtering and consistent data output handling
- **🔧 Developer Experience** - Enhanced debugging capabilities and more reliable database operations

## Previous Major Updates

### v1.5.0 Features
- **🔄 Enhanced Dependency Injection** - Improved circular dependency resolution and lazy loading
- **🏗️ Advanced Module System** - Better module organization with hierarchical dependency management
- **⚡ Performance Optimizations** - Faster service resolution and reduced memory footprint
- **🛡️ Enhanced Error Handling** - Better error messages and debugging capabilities
- **📦 Improved Configuration** - More flexible configuration options and environment variable support
- **🔧 Developer Experience** - Enhanced TypeScript support and better IDE integration

## Previous Releases

### v1.2.0 Features
- **🚀 Enterprise Logging System** - Complete rewrite with class-based controls, offline queuing, and real-time broadcasting
- **🛠️ TransformMongoose Utility** - Consistent JSON transformations for Mongoose schemas with `_id` → `id` conversion
- **📊 Advanced Logger Features** - Database operation queuing, container integration, and persistent configuration
- **⚡ Real-time Log Streaming** - Live log broadcasting via Socket.IO for development and monitoring
- **🔧 Auto-configuration** - Intelligent log level adjustment based on database availability

## Installation

```bash
npm install @titan/kernel reflect-metadata
# Optional: for database logging
npm install mongoose
```

## Quick Start

```typescript
import 'reflect-metadata';
import { TitanKernel, Injectable, Controller, Gateway } from '@titan/kernel';

@Injectable()
export class UserService {
  constructor(
    private config: ConfigService,
    private logger: TitanLoggerService
  ) {
    this.logger.info('UserService', 'UserService initialized');
  }

  getUsers() {
    return ['user1', 'user2'];
  }
}

@Controller('/api/users')
export class UserController {
  constructor(private userService: UserService) {}

  getAll() {
    return this.userService.getUsers();
  }
}

@Gateway({ namespace: '/users' })
export class UserGateway {
  constructor(private userService: UserService) {}

  handleConnection() {
    // Socket.IO connection logic
  }
}

// Bootstrap with database logging
async function bootstrap() {
  const context = await TitanKernel.create({
    autoScan: true,
    logging: {
      databaseAccess: true  // Enable database persistence
    }
  });

  console.log('Services:', context.services.size);
  console.log('Controllers:', context.controllers.length);
  console.log('Gateways:', context.gateways.length);
  console.log('Database Connected:', context.database?.isReady());
  console.log('Socket Service Available:', context.socket?.isReady());
}

bootstrap();
```

## API Reference

### Decorators

#### @Injectable(options?)
Marks a class as injectable service.

```typescript
@Injectable({ providedIn: 'root' })
export class MyService {
  constructor(private otherService: OtherService) {}
}
```

#### @Controller(path?, options?)
Marks a class as a controller.

```typescript
@Controller('/api/users', { middleware: [authMiddleware] })
export class UserController {
  constructor(private userService: UserService) {}
}
```

#### @Gateway(options?)
Marks a class as a WebSocket gateway.

```typescript
@Gateway({ namespace: '/chat', cors: true })
export class ChatGateway {
  constructor(private messageService: MessageService) {}
}
```

#### @Component(options?)
Marks a class as a general component (similar to @Injectable but with additional options).

```typescript
@Component({ 
  lifecycle: ServiceLifecycle.SINGLETON,
  tags: ['business-logic', 'core'] 
})
export class BusinessService {
  constructor(private dataService: DataService) {}
}
```

#### @Module(metadata)
Defines a module with providers, controllers, and gateways.

```typescript
@Module({
  providers: [UserService, AuthService],
  controllers: [UserController],
  gateways: [UserGateway]
})
export class UserModule {}
```

### Advanced Module System (v1.5.0+)

TitanKernel v1.5.0 introduces enhanced module capabilities with hierarchical organization:

```typescript
@Module({
  imports: [DatabaseModule, LoggingModule],  // Import other modules
  providers: [UserService, AuthService],
  controllers: [UserController],
  gateways: [UserGateway],
  exports: [UserService]  // Export services for other modules
})
export class UserModule {}

@Module({
  imports: [UserModule],  // Import UserModule and its exported services
  providers: [AdminService],
  controllers: [AdminController]
})
export class AdminModule {}

// Bootstrap with modules
const context = await TitanKernel.create({
  modules: [UserModule, AdminModule],
  autoScan: false  // Disable auto-scan when using explicit modules
});
```

**Module Features:**
- **Hierarchical Dependencies** - Modules can import other modules
- **Selective Exports** - Control which services are available to other modules
- **Lazy Loading** - Modules are loaded only when needed
- **Dependency Validation** - Circular module dependencies are detected and prevented
- **Scope Isolation** - Services can be scoped to specific modules

### Circular Dependencies

TitanKernel automatically handles circular dependencies using lazy proxies:

```typescript
@Injectable()
export class ServiceA {
  constructor(private serviceB: ServiceB) {} // ✅ Works!
}

@Injectable()
export class ServiceB {
  constructor(private serviceA: ServiceA) {} // ✅ Works!
}

// For complex scenarios, use forwardRef:
@Injectable()
export class ServiceC {
  constructor(
    @Inject(forwardRef(() => ServiceD)) 
    private serviceD: ServiceD
  ) {}
}
```

### Configuration

Create `titan.config.json` in **your project's root directory** (not in the npm package):

```json
{
  "environment": {
    "isProduction": false
  },
  "server": {
    "httpPort": 8000,
    "httpsPort": 8443
  },
  "database": {
    "urlProd": "mongodb+srv://username:password@cluster.mongodb.net/myapp_prod?retryWrites=true&w=majority",
    "prodName": "MyApp Production",
    "urlDev": "mongodb+srv://username:password@cluster.mongodb.net/myapp_dev?retryWrites=true&w=majority",
    "devName": "MyApp Development",
    "useProductionDatabase": false,
    "type": "mongo"
  },
  "logging": {
    "databaseAccess": true,
    "logLevel": 4
  },
  "authentication": {
    "jwtSecret": "your-secret-key",
    "jwtExpiration": "1h"
  },
  "cors": {
    "allowAnyOrigin": true,
    "allowedOrigins": [
      "http://localhost:4200",
      "https://your-production-app.com"
    ]
  }
}
```

**Database Configuration:**
TitanKernel supports flexible database configuration with production/development separation:

- **`urlProd`** - MongoDB connection string for production
- **`urlDev`** - MongoDB connection string for development  
- **`useProductionDatabase`** - Boolean flag to select which database to use
- **`type`** - Database type (currently "mongo" is supported)
- **`prodName`** / **`devName`** - Friendly names for database connections

**Database Selection Logic:**
The database service will use:
1. **Production DB** if `useProductionDatabase: true` OR `environment.isProduction: true`
2. **Development DB** otherwise

This allows for flexible database switching based on either environment or explicit configuration.

**Configuration Priority:**
TitanKernel loads configuration in the following order (later sources override earlier ones):
1. `titan.config.json` file in project root
2. Environment variables (automatically mapped)

**Environment Variable Mapping:**
```bash
NODE_ENV=production              # → config.environment.isProduction (true if NODE_ENV=production)
PORT=4000                       # → config.port
DATABASE_URL=mongodb://...      # → config.database.url
```

**Project Structure:**
```
your-project/                  (e.g., titan-exp4/)
├── titan.config.json          ← Create this file here
├── package.json
├── src/
│   ├── services/
│   ├── controllers/
│   └── app.ts
└── node_modules/
    └── @titan/kernel/         ← TitanKernel package (no config here)
```

**Important:** The config file should be placed in your project root (e.g., `d:\titan-exp4\titan.config.json`), not inside the TitanKernel package.

Access config in services:

```typescript
@Injectable()
export class DatabaseService {
  constructor(private config: ConfigService) {
    // Get specific config values
    const dbConfig = this.config.get('database');
    const httpPort = this.config.get('server.httpPort', 8000);
    
    // Or get the entire config object
    const fullConfig = this.config.getAll();
    const isProduction = fullConfig.environment?.isProduction || false;
    
    // Database selection logic
    const useProductionDB = fullConfig.database?.useProductionDatabase || isProduction;
    const dbUrl = useProductionDB ? 
      fullConfig.database?.urlProd : 
      fullConfig.database?.urlDev;
  }
}
```

### Logging

Built-in enhanced logger with **automatic console capture**, **consistent data output**, and **optional database persistence**:

```typescript
@Injectable()
export class MyService {
  constructor(private logger: TitanLoggerService) {}

  doSomething() {
    this.logger.debug('MyService', 'Debug message', { data: 'value' });
    this.logger.info('MyService', 'Info message');
    this.logger.warn('MyService', 'Warning message');
    this.logger.error('MyService', 'Error message', { error: 'details' });
    
    // Enhanced data handling (v1.8.4+) - empty/null data is automatically filtered
    this.logger.info('MyService', 'Clean message', null);     // Shows: "Clean message" (no data)
    this.logger.info('MyService', 'With data', { key: 'value' }); // Shows: "With data { key: 'value' }"
    
    // Regular console calls are automatically captured for frontend
    console.log('This will be captured and sent to frontend via Socket.IO');
  }
}
```

**Simplified Configuration:**
TitanKernel uses a simple configuration approach - just set `databaseAccess` and `logLevel` in your config file:

```json
{
  "logging": {
    "databaseAccess": true,
    "logLevel": 4
  }
}
```

**Runtime Behavior:**
- **Log Level**: Defaults to `NONE` (silent)
- **Console Capture**: Always enabled (can be toggled at runtime)
- **Socket.IO**: Always enabled for real-time frontend updates
- **Database Access**: Controlled by config file
- **Auto-Upgrade**: When `databaseAccess: true` and database is ready, log level automatically upgrades to `INFO`

**Log Level Filtering Logic:**

TitanKernel uses a hierarchical log level system where higher numeric values show more messages:

| Log Level | Value | Shows Messages For |
|-----------|-------|-------------------|
| `NONE` | 0 | No messages (silent) |
| `INFO` | 1 | INFO only |
| `ERROR` | 2 | INFO, ERROR |
| `WARN` | 3 | INFO, ERROR, WARN |
| `DEBUG` | 4 | INFO, ERROR, WARN, DEBUG |
| `VERBOSE` | 5 | All messages (INFO, ERROR, WARN, DEBUG, VERBOSE) |

**Filter Logic:** A message is shown if `messageLevel <= configuredLogLevel`. This means:
- Setting `logLevel: 4` (DEBUG) will show INFO, ERROR, WARN, and DEBUG messages
- Setting `logLevel: 1` (INFO) will only show INFO messages
- Setting `logLevel: 5` (VERBOSE) will show all messages

**Verbose Mode Override:** The logger also supports a `enableVerbose` flag that, when enabled, bypasses all log level filtering and shows all messages regardless of the configured log level.

```typescript
// Example: If logLevel is set to DEBUG (4)
this.logger.info('MyService', 'This will show');     // 1 <= 4 ✅
this.logger.error('MyService', 'This will show');    // 2 <= 4 ✅
this.logger.warn('MyService', 'This will show');     // 3 <= 4 ✅
this.logger.debug('MyService', 'This will show');    // 4 <= 4 ✅
this.logger.verbose('MyService', 'This will NOT show'); // 5 <= 4 ❌
```

**Console Capture & Data Handling (v1.8.4+):**
- All `console.log()`, `console.warn()`, `console.error()`, `console.info()` calls are automatically captured
- **Consistent Data Output** - Empty, null, or undefined data objects are automatically filtered out
- **Smart Data Normalization** - Ensures clean console, socket, and database outputs
- **Unlimited buffer size** - handles large data streams (10MB+ files, Puppeteer blobs, etc.)
- Captured console output is sent to frontend via Socket.IO for real-time debugging
- TitanKernel's own logging still appears in console while user console calls are captured
- No infinite recursion - smart filtering prevents logging loops

**Database Persistence:**
- **Off by default** - set `"databaseAccess": true` to persist logs to MongoDB
- Logs are stored in `titan_logs` collection with timestamps, levels, and metadata
- Graceful fallback - if database is unavailable, logging continues without persistence
- Automatic reconnection handling and offline queue for when database is not ready

### Socket Service

Built-in **centralized Socket.IO service** for real-time event handling across your application:

```typescript
@Injectable()
export class MyGateway {
  constructor(private socket: SocketService) {}

  initializeSocketEvents() {
    // Register socket events (works even if Socket.IO server isn't ready yet)
    this.socket.registerEvents((io) => {
      io.on('connection', (clientSocket) => {
        console.log('Client connected:', clientSocket.id);
        
        clientSocket.on('getData', () => {
          clientSocket.emit('dataResponse', { message: 'Hello!' });
        });
      });
    });
  }

  broadcastToAll(event: string, data: any) {
    // Broadcast to all connected clients
    this.socket.emitToAll(event, data);
  }
}
```

**Integration with Socket.IO Server:**
```typescript
// After bootstrap, integrate with your Socket.IO server
const context = await TitanKernel.create();
const io = new Server(httpServer);

// Initialize the socket service with your Socket.IO server
context.socket.setServer(io);

// Socket service is now ready and will process any queued event registrations
console.log('Socket service ready:', context.socket.isReady());
```

**Key Features:**
- **Event Registration Queue**: Register events before Socket.IO server is ready
- **Automatic Processing**: When `setServer()` is called, all queued registrations are processed
- **Broadcasting**: Simple API to emit events to all connected clients
- **Logger Integration**: Automatically connects logger to socket server for real-time log streaming
- **Gateway Integration**: Perfect for Socket.IO gateways and real-time features

### Advanced Bootstrap

```typescript
const context = await TitanKernel.create({
  autoScan: true,
  scanOptions: {
    include: ['src/**/*.service.ts', 'src/**/*.controller.ts'],
    exclude: ['**/*.test.ts'],
    baseDir: process.cwd()
  },
  modules: [UserModule, AdminModule],  // v1.5.0+ Module system
  database: {
    type: 'mongo',
    urlProd: 'mongodb+srv://username:password@cluster.mongodb.net/myapp_prod?retryWrites=true&w=majority',
    prodName: 'MyApp Production',
    urlDev: 'mongodb+srv://username:password@cluster.mongodb.net/myapp_dev?retryWrites=true&w=majority',
    devName: 'MyApp Development',
    useProductionDatabase: false,
    options: {
      // Enhanced connection options (v1.8.4+)
      serverSelectionTimeoutMS: 5000,  // Quick timeout for faster feedback
      socketTimeoutMS: 45000,          // Socket timeout
      maxPoolSize: 10,                 // Connection pooling
      // Add any other mongoose connection options
    }
  },
  logging: {
    databaseAccess: true    // Enable database persistence
  }
});

// Access resolved services
const userService = context.services.get('UserService');
const controllers = context.controllers;
const gateways = context.gateways;
const database = context.database;
const socket = context.socket;

// Database connection with retry logic (v1.8.4+)
if (database && !database.isReady()) {
  try {
    await database.connect(databaseConfig, 5); // Retry up to 5 times
    console.log('Database connected with retry logic');
  } catch (error) {
    console.log('Database connection failed after retries:', error.message);
  }
}

// Initialize Socket.IO server (if you have one)
// const io = new Server(httpServer);
// context.socket.setServer(io);
```

### Database Service API

The DatabaseService provides comprehensive model management capabilities with robust connection handling:

```typescript
import { DatabaseService, ModelInfo } from '@titan/kernel';

// Model Registration
const modelInfo: ModelInfo = {
  name: 'Product',
  schema: new Schema({ name: String, price: Number }),
  collection: 'products'
};
const ProductModel = database.registerModel(modelInfo);

// Model Retrieval
const UserModel = database.getModel<IUser>('User');
const allModels = database.getAllModels();
const modelNames = database.getModelNames();

// Connection Management
const isReady = database.isReady();
const connection = database.getConnection();

// Model Validation with Retry Logic
await database.checkModels(3); // Retry up to 3 times

// Robust Connection with Auto-Retry
await database.connect(databaseConfig, 5); // Retry up to 5 times
```

**Enhanced Connection Features (v1.8.4+):**
- **Automatic Retry Logic**: Connection attempts with exponential backoff (2s, 4s, 8s...)
- **Smart Event Listeners**: Connection-specific monitoring using `this.connection.connection.on()`
- **Auto-Reconnection**: Automatic reconnection on network drops with configurable delays
- **Connection State Validation**: Real-time monitoring of connection readiness
- **Model Validation Retry**: Automatic retry for model validation with timeout protection
- **Graceful Error Handling**: Comprehensive error logging and recovery strategies

**Available Methods:**
- `connect(config, retryAttempts?)` - Connect with automatic retry logic
- `disconnect()` - Clean disconnect with reconnection cleanup
- `registerModel(modelInfo: ModelInfo)` - Register a new mongoose model
- `getModel<T>(name: string)` - Get a registered model by name
- `getAllModels()` - Get all registered models as a Map
- `getModelNames()` - Get array of all registered model names
- `checkModels(retryAttempts?)` - Validate all registered models with retry logic
- `isReady()` - Check if database connection is ready with state validation
- `getConnection()` - Get the mongoose connection instance

### Manual Service Resolution

```typescript
import { container } from '@titan/kernel';

// Resolve services manually
const userService = container.resolve(UserService);
const controllers = container.getControllerClasses();
const gateways = container.getGatewayClasses();
```

### Database Integration

TitanKernel provides optional MongoDB integration with enhanced model management:

```typescript
import { DatabaseService, ModelInfo, LogModel } from '@titan/kernel';
import { Schema } from 'mongoose';

@Injectable()
export class MyService {
  constructor(private database: DatabaseService) {}

  async setupDatabase() {
    const isReady = this.database.isReady();
    console.log('Database ready:', isReady);
    
    if (isReady) {
      // Register a custom model
      const userModelInfo: ModelInfo = {
        name: 'User',
        schema: new Schema({
          name: { type: String, required: true },
          email: { type: String, required: true },
          createdAt: { type: Date, default: Date.now }
        }),
        collection: 'users'
      };
      
      const UserModel = this.database.registerModel(userModelInfo);
      
      // Get registered models
      const userModel = this.database.getModel('User');
      const allModels = this.database.getAllModels();
      const modelNames = this.database.getModelNames();
      
      console.log('Available models:', modelNames);
      
      // Access log entries from database
      const recentLogs = await LogModel.find()
        .sort({ timestamp: -1 })
        .limit(10);
      console.log('Recent logs:', recentLogs);
    }
  }
}
```

**ModelInfo Interface:**
```typescript
interface ModelInfo {
  name: string;                    // Model name
  schema: mongoose.Schema;         // Mongoose schema
  collection?: string;             // Optional collection name
}
```

**Database Features:**
- MongoDB integration with mongoose (supports both local and Atlas)
- Atlas-ready with connection pooling and timeout configurations
- **Robust Connection Management**: Automatic retry logic with exponential backoff
- **Smart Reconnection**: Automatic reconnection on network drops with event listeners
- **Connection State Monitoring**: Real-time connection state tracking and validation
- **Model Management**: Register, retrieve, and manage custom models
- **Model Registry**: Track all registered models with `getModel()`, `getAllModels()`, `getModelNames()`
- **Model Validation**: Automatic schema and collection validation via `checkModels()` with retry logic
- **Event-Driven Architecture**: Connection-specific event listeners for disconnect/error/reconnect events
- Automatic log model registration
- Graceful fallback when database is unavailable
- Configurable connection options with smart defaults

## File Scanning

TitanKernel automatically scans for these file patterns:
- `**/*.service.ts`
- `**/*.controller.ts`
- `**/*.gateway.ts`
- `**/*.provider.ts`
- `**/*.guard.ts`
- `**/*.middleware.ts`

## TypeScript Configuration

Ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

## Enhanced Logging Features

TitanKernel v1.5.0 includes a completely enhanced logging system with enterprise-grade features:

### Advanced Logger Capabilities

- **Class-based Log Controls** - Enable/disable logging per service class
- **Database Operation Queuing** - Offline-capable with automatic queue processing
- **Real-time Event Broadcasting** - Live log streaming via Socket.IO
- **Container Integration** - Automatic discovery of injectable classes
- **Persistent Configuration** - Database-stored logging preferences
- **Console Capture** - Unlimited buffering for large file processing
- **Auto-configuration** - Intelligent log level adjustment based on environment

```typescript
import { TitanLoggerService, LogLevel } from '@titan/kernel';

@Injectable()
export class MyService {
  constructor(private logger: TitanLoggerService) {}

  initializeService() {
    // Configure logging for specific classes
    this.logger.enableLoggingForClass('MyService');
    this.logger.setGlobalLogLevel(LogLevel.INFO);
    
    // Use structured logging
    this.logger.info('MyService', 'Service initialized', { 
      timestamp: new Date(),
      environment: process.env.NODE_ENV 
    });
  }

  demonstrateLogLevels() {
    // Set log level to DEBUG (4) - will show INFO, ERROR, WARN, DEBUG
    this.logger.setGlobalLogLevel(LogLevel.DEBUG);
    
    this.logger.info('MyService', 'Info message');       // Will show (1 <= 4)
    this.logger.error('MyService', 'Error message');     // Will show (2 <= 4)  
    this.logger.warn('MyService', 'Warning message');    // Will show (3 <= 4)
    this.logger.debug('MyService', 'Debug message');     // Will show (4 <= 4)
    this.logger.verbose('MyService', 'Verbose message'); // Will NOT show (5 <= 4)
    
    // Change to WARN (3) - will only show INFO, ERROR, WARN
    this.logger.setGlobalLogLevel(LogLevel.WARN);
    
    this.logger.info('MyService', 'Still shows');        // Will show (1 <= 3)
    this.logger.debug('MyService', 'Now hidden');        // Will NOT show (4 <= 3)
  }
}
```

## TransformMongoose Utility

Enhanced in v1.5.0! Consistent JSON transformation for Mongoose schemas:

```typescript
import { TransformMongoose, ToJSONOptions } from '@titan/kernel';
import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  name: String,
  email: String,
  password: String,
  createdAt: { type: Date, default: Date.now }
});

// Apply consistent JSON transformation
TransformMongoose(UserSchema, {
  removeFields: ['password'],  // Remove sensitive fields
  virtuals: true              // Include virtual properties
});

export const User = model('User', UserSchema);

// JSON output will automatically have:
// - ret.id instead of ret._id
// - No __v field
// - No password field
// - Included virtuals
```

### TransformMongoose Options

```typescript
interface ToJSONOptions {
  removeFields?: string[];           // Additional fields to remove
  additionalTransform?: (doc: any, ret: any) => any; // Custom transform
  virtuals?: boolean;               // Include virtual properties
}
```

## Examples

TitanKernel includes several example applications:

### Basic Example
```bash
npm run example
```
Demonstrates basic DI, scanning, and logging without database.

### Database Example
```bash
npm run example:db
```
Demonstrates database integration with log persistence. Requires MongoDB Atlas or local MongoDB instance.

### No-Database Example
```bash
npm run example:no-db
```
Demonstrates graceful fallback when database is not available.

## License

MIT

### Custom Configuration Interface

You can define your own configuration interface for type safety:

```typescript
import { ConfigService, DefaultTitanConfig } from '@titan/kernel';

// Define your custom configuration interface
interface MyAppConfig extends DefaultTitanConfig {
  myApp: {
    name: string;
    version: string;
    features: {
      enableFeatureX: boolean;
      maxUsers: number;
    };
  };
  external: {
    apiKeys: {
      stripe: string;
      sendgrid: string;
    };
  };
}

@Injectable()
export class MyService {
  constructor(private config: ConfigService<MyAppConfig>) {}

  initializeApp() {
    // Now you get full TypeScript intellisense and type checking
    const appName = this.config.get('myApp.name', 'Default App');
    const maxUsers = this.config.get('myApp.features.maxUsers', 100);
    const stripeKey = this.config.get('external.apiKeys.stripe');
    
    // TypeScript will validate these paths exist in your interface
    console.log(`Initializing ${appName} with max ${maxUsers} users`);
  }
}
```

Create your corresponding `titan.config.json`:

```json
{
  "environment": {
    "isProduction": false
  },
  "port": 3000,
  "logging": {
    "databaseAccess": false
  },
  "database": {
    "url": "mongodb+srv://...",
    "name": "myapp"
  },
  "myApp": {
    "name": "Titan Express 4",
    "version": "1.0.0",
    "features": {
      "enableFeatureX": true,
      "maxUsers": 1000
    }
  },
  "external": {
    "apiKeys": {
      "stripe": "sk_test_...",
      "sendgrid": "SG...."
    }
  }
}
```

**Access config in services:**
```typescript
@Injectable()
export class MyService {
  constructor(private config: ConfigService<MyAppConfig>) {}

  someMethod() {
    const featureXEnabled = this.config.get('myApp.features.enableFeatureX');
    // Use the config value
  }
}
```
