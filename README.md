# TitanKernel 🚀

Angular-inspired modular backend kernel for Node.js with full dependency injection, circular dependency support, and automatic class scanning.

## Features

- ✅ **Angular-style Dependency Injection** - Full constructor injection with access modifiers
- ✅ **Circular Dependency Support** - Lazy proxies handle complex dependency chains  
- ✅ **Automatic Class Scanning** - Zero-config service discovery
- ✅ **Multiple Decorator Types** - @Injectable, @Controller, @Gateway, @Module
- ✅ **Enhanced Logging** - Built-in logger with Socket.IO integration and database persistence
- ✅ **Database Integration** - Optional MongoDB logging with configurable persistence flag
- ✅ **Configuration Management** - Flexible config loading from multiple sources
- ✅ **TypeScript Native** - Full type safety and decorator support

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
    this.logger.info('UserService initialized', undefined, 'UserService');
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
    logLevel: 'debug',
    database: {
      url: 'mongodb+srv://username:password@cluster.mongodb.net/myapp?retryWrites=true&w=majority'
    },
    logger: {
      enableDatabase: true,  // Enable database persistence
      enableConsole: true,
      enableSocket: true
    }
  });

  console.log('Services:', context.services.size);
  console.log('Controllers:', context.controllers.length);
  console.log('Gateways:', context.gateways.length);
  console.log('Database Connected:', context.database?.isReady());
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
  "environment": "development",
  "port": 3000,
  "logging": {
    "level": "debug",
    "enableConsole": true,
    "enableDatabase": false
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

**Configuration Priority:**
TitanKernel loads configuration in the following order (later sources override earlier ones):
1. `titan.config.json` file in project root
2. Environment variables (automatically mapped)

**Environment Variable Mapping:**
```bash
NODE_ENV=production           # → config.environment
PORT=4000                     # → config.port  
DATABASE_URL=mongodb://...    # → config.database.url
LOG_LEVEL=info               # → config.logging.level
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
    const dbUrl = this.config.get('database.url');
    const port = this.config.get('port', 3000);
  }
}
```

### Logging

Built-in enhanced logger with multiple outputs, **automatic console capture**, and **optional database persistence**:

```typescript
@Injectable()
export class MyService {
  constructor(private logger: TitanLoggerService) {}

  doSomething() {
    this.logger.debug('Debug message', { data: 'value' }, 'MyService');
    this.logger.info('Info message', undefined, 'MyService');
    this.logger.warn('Warning message', undefined, 'MyService');
    this.logger.error('Error message', { error: 'details' }, 'MyService');
    
    // Regular console calls are automatically captured for frontend
    console.log('This will be captured and sent to frontend via Socket.IO');
  }
}
```

**Logger Configuration:**
```typescript
const context = await TitanKernel.create({
  logger: {
    enableDatabase: true,    // Enable database persistence (default: false)
    enableConsole: true,     // Enable console output (default: true)
    enableSocket: true,      // Enable Socket.IO output (default: true)
    maxBufferSize: 2000      // Log buffer size (default: 1000)
  }
});
```

**Console Capture Feature:**
- All `console.log()`, `console.warn()`, `console.error()`, `console.info()` calls are automatically captured
- Captured console output is sent to frontend via Socket.IO for real-time debugging
- TitanKernel's own logging still appears in console while user console calls are captured
- No infinite recursion - smart filtering prevents logging loops

**Database Persistence:**
- **Off by default** - set `enableDatabase: true` to persist logs to MongoDB
- Logs are stored in `titan_logs` collection with timestamps, levels, and metadata
- Graceful fallback - if database is unavailable, logging continues without persistence
- Automatic reconnection handling

### Advanced Bootstrap

```typescript
const context = await TitanKernel.create({
  autoScan: true,
  scanOptions: {
    include: ['src/**/*.service.ts', 'src/**/*.controller.ts'],
    exclude: ['**/*.test.ts'],
    baseDir: process.cwd()
  },
  logLevel: 'info',
  database: {
    url: 'mongodb+srv://username:password@cluster.mongodb.net/myapp?retryWrites=true&w=majority',
    name: 'myapp',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  },
  logger: {
    enableDatabase: true,
    enableConsole: true,
    enableSocket: true,
    maxBufferSize: 2000
  }
});

// Access resolved services
const userService = context.services.get('UserService');
const controllers = context.controllers;
const gateways = context.gateways;
const database = context.database;
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
  "environment": "development",
  "port": 3000,
  "logging": {
    "level": "debug",
    "enableConsole": true,
    "enableDatabase": false
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
