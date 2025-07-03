# TitanKernel 🚀

Angular-inspired modular backend kernel for Node.js with full dependency injection, circular dependency support, and automatic class scanning.

**Repository:** [https://github.com/marcus-dutton/titan-kernel](https://github.com/marcus-dutton/titan-kernel)

## Features

- ✅ **Angular-style Dependency Injection** - Full constructor injection with access modifiers
- ✅ **Circular Dependency Support** - Lazy proxies handle complex dependency chains  
- ✅ **Automatic Class Scanning** - Zero-config service discovery
- ✅ **Multiple Decorator Types** - @Injectable, @Controller, @Gateway, @Module, @Component
- ✅ **Enterprise Logging** - Advanced logger with class-based controls, offline queuing, and real-time broadcasting
- ✅ **Database Integration** - Optional MongoDB logging with configurable persistence flag
- ✅ **Mongoose Utilities** - TransformMongoose for consistent JSON transformations
- ✅ **Configuration Management** - Flexible config loading from multiple sources
- ✅ **TypeScript Native** - Full type safety and decorator support

## What's New in v1.2.0 🎉

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
    database: {
      url: 'mongodb+srv://username:password@cluster.mongodb.net/myapp?retryWrites=true&w=majority'
    },
    logging: {
      databaseAccess: true  // Enable database persistence
    }
  });

  // All log output now goes through the logger and respects logLevel and class-based filtering
  context.logger.info('Example', `Services: ${context.services.size}`);
  context.logger.info('Example', `Controllers: ${context.controllers.length}`);
  context.logger.info('Example', `Gateways: ${context.gateways.length}`);
  context.logger.info('Example', `Database Connected: ${context.database?.isReady()}`);
  context.logger.info('Example', `Socket Service Available: ${context.socket?.isReady()}`);
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
  "port": 3000,
  "logging": {
    "databaseAccess": false,
    "logLevel": "DEBUG" // or use a number, e.g. 4
  },
  "database": {
    "url": "mongodb+srv://username:password@cluster.mongodb.net/myapp?retryWrites=true&w=majority",
    "name": "myapp",
    "options": {
      "maxPoolSize": 10,
      "serverSelectionTimeoutMS": 5000,
      "socketTimeoutMS": 45000
    }
  },
  "api": {
    "version": "v1",
    "prefix": "/api"
  }
}
```


**Logging Levels and Filtering:**

The `logLevel` option controls which logs are output. Accepts either a string or a number:

- String values: `NONE`, `INFO`, `WARN`, `ERROR`, `DEBUG`, `VERBOSE`
- Numeric values: `0` = NONE, `1` = INFO, `2` = WARN, `3` = ERROR, `4` = DEBUG, `5` = VERBOSE

**Log filtering:** Only logs with a level less than or equal to the configured `logLevel` are shown. Setting `NONE` disables all logs. All logs (including bootstrap summaries) now respect the configured log level and enabled classes. You can also enable/disable logging for specific classes.

**Override order:**
1. Database config (if available) takes precedence
2. Otherwise, value from `titan.config.json` is used

**Retry logic:**
If database logging is enabled and a log write fails, the logger will retry up to 3 times (with 1s delay). If all attempts fail, the log is queued for later persistence.

**Environment Variable Mapping:**
```bash
NODE_ENV=production           # → config.environment.isProduction (true if NODE_ENV=production)
PORT=4000                     # → config.port
DATABASE_URL=mongodb://...    # → config.database.url
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
    const dbUrl = this.config.get('database.url');
    const port = this.config.get('port', 3000);
    
    // Or get the entire config object
    const fullConfig = this.config.getAll();
    const isProduction = fullConfig.environment?.isProduction || false;
  }
}
```


### Logging

TitanKernel provides a robust, configurable logger with:
- **Log levels:** `NONE`, `INFO`, `WARN`, `ERROR`, `DEBUG`, `VERBOSE` (use as string or number)
- **Class-based filtering:** Enable/disable logs for specific classes
- **Retry logic:** Automatic retry and queuing for DB log persistence
- **All logs go through the logger:** No direct `console.log` in services or kernel

```typescript
@Injectable()
export class MyService {
  constructor(private logger: TitanLoggerService) {}

  doSomething() {
    this.logger.verbose('MyService', 'Verbose message for deep diagnostics');
    this.logger.debug('MyService', 'Debug message', { data: 'value' });
    this.logger.info('MyService', 'Info message');
    this.logger.warn('MyService', 'Warning message');
    this.logger.error('MyService', 'Error message', { error: 'details' });
    // All logs are filtered by logLevel and class-based settings
  }
}
```

**Class-based log control:**
```typescript
// Enable or disable logging for a specific class
logger.enableLoggingForClass('MyService');
logger.disableLoggingForClass('OtherService');
```

**No direct console.log:**
All logging in services and kernel must use the logger. Console output is reserved for logger internals and example/demo code only.


**Configuration Example:**
```json
{
  "logging": {
    "databaseAccess": true,
    "logLevel": "VERBOSE"
  }
}
```


**Runtime Behavior:**
- **Log Level**: Defaults to `DEBUG` (4) unless overridden; DB config takes precedence
- **Class-based filtering**: Only enabled classes output logs
- **Retry logic**: DB log writes are retried up to 3 times, then queued
- **No direct console.log**: All logs go through the logger

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
  database: {
    url: 'mongodb+srv://username:password@cluster.mongodb.net/myapp?retryWrites=true&w=majority',
    name: 'myapp',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
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

// Initialize Socket.IO server (if you have one)
// const io = new Server(httpServer);
// context.socket.setServer(io);
const socket = context.socket;
```

### Manual Service Resolution

```typescript
import { container } from '@titan/kernel';

// Resolve services manually
const userService = container.resolve(UserService);
const controllers = container.getControllerClasses();
const gateways = container.getGatewayClasses();
```

### Database Integration

TitanKernel provides optional MongoDB integration for log persistence:

```typescript
import { DatabaseService, LogModel } from '@titan/kernel';

@Injectable()
export class MyService {
  constructor(private database: DatabaseService) {}

  async checkDatabase() {
    const isReady = this.database.isReady();
    console.log('Database ready:', isReady);
    
    // Access log entries from database
    if (isReady) {
      const recentLogs = await LogModel.find()
        .sort({ timestamp: -1 })
        .limit(10);
      console.log('Recent logs:', recentLogs);
    }
  }
}
```

**Database Features:**
- MongoDB integration with mongoose (supports both local and Atlas)
- Atlas-ready with connection pooling and timeout configurations
- Automatic log model registration
- Connection state management
- Graceful fallback when database is unavailable
- Configurable connection options

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

TitanKernel v1.2.0 includes a completely enhanced logging system with enterprise-grade features:


### Advanced Logger Capabilities

- **LogLevel.VERBOSE**: Deep diagnostics, only shown if logLevel is set to VERBOSE (5)
- **Class-based Log Controls**: Enable/disable logging per service class
- **Database Operation Queuing**: Offline-capable with automatic queue processing and retry
- **Real-time Event Broadcasting**: Live log streaming via Socket.IO
- **Persistent Configuration**: Database-stored logging preferences
- **No direct console.log**: All logs go through the logger

```typescript
import { TitanLoggerService, LogLevel } from '@titan/kernel';

@Injectable()
export class MyService {
  constructor(private logger: TitanLoggerService) {}

  initializeService() {
    // Configure logging for specific classes
    this.logger.enableLoggingForClass('MyService');
    this.logger.setGlobalLogLevel(LogLevel.VERBOSE);
    
    // Use structured logging
    this.logger.verbose('MyService', 'Verbose diagnostics');
    this.logger.info('MyService', 'Service initialized', { 
      timestamp: new Date(),
      environment: process.env.NODE_ENV 
    });
  }
}
```

### Logger Configuration

```json
{
  "logging": {
    "databaseAccess": true,
    "enableConsole": true,
    "enableSocket": true
  }
}
```

## TransformMongoose Utility

New in v1.2.0! Consistent JSON transformation for Mongoose schemas:

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
