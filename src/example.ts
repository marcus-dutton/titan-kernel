import 'reflect-metadata';
import { TitanKernel, Injectable, Controller, Gateway, ConfigService, TitanLoggerService } from './index';

// Example service
@Injectable()
export class ExampleService {
  constructor(
    private config: ConfigService,
    private logger: TitanLoggerService
  ) {
    this.logger.info('ExampleService', 'ExampleService initialized');
  }

  getData() {
    const config = this.config.getAll();
    const isProduction = config.environment?.isProduction || false;
    const environment = isProduction ? 'production' : 'development';
    this.logger.verbose('Verbose log: getData called', { environment });
    this.logger.debug('ExampleService', 'Getting data', { environment, isProduction, fullConfig: config });
    this.logger.info('ExampleService', 'Returning data', { environment });
    return { message: `Hello from ${environment}!`, timestamp: new Date() };
  }
}

// Example controller
@Controller('/api/example')
export class ExampleController {
  constructor(
    private exampleService: ExampleService,
    private logger: TitanLoggerService
  ) {
    this.logger.info('ExampleController', 'ExampleController initialized');
  }

  getExample() {
    this.logger.verbose('getExample called');
    return this.exampleService.getData();
  }
}

// Example gateway with socket integration
@Gateway({ namespace: '/example' })
export class ExampleGateway {
  constructor(
    private exampleService: ExampleService,
    private logger: TitanLoggerService
  ) {
    this.logger.info('ExampleGateway', 'ExampleGateway initialized');
  }

  handleConnection() {
    const data = this.exampleService.getData();
    this.logger.info('ExampleGateway', 'Gateway connection', data);
    return data;
  }

  // Example of how to register socket events when Socket.IO is available
  registerSocketEvents(context: any) {
    if (context.socket && context.socket.isReady()) {
      context.socket.registerEvents((io: any) => {
        io.on('connection', (socket: any) => {
          this.logger.info('ExampleGateway', 'Socket client connected', { socketId: socket.id });
          
          socket.on('getExample', () => {
            const data = this.exampleService.getData();
            socket.emit('exampleData', data);
            this.logger.debug('ExampleGateway', 'Example data sent to client', { socketId: socket.id, data });
          });
        });
      });
    }
  }
}

// Bootstrap example
async function bootstrap() {
  const fs = require('fs');
  const path = require('path');
  try {
    // Print Node.js and Mongoose versions (for demo only)
    const mongoose = require('mongoose');
    // Use logger for all output
    const logger = new (require('./services/titan-logger.service').TitanLoggerService)();
    logger.info('Example', `[example.ts] Node.js version: ${process.version}`);
    logger.info('Example', `[example.ts] Mongoose version: ${mongoose.version}`);

    // Load config from titan.config.json in the kernel folder
    const configPath = path.resolve(__dirname, '../titan.config.json');
    const configRaw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configRaw);
    const databaseConfig = config.database;
    logger.info('Example', '[example.ts] Loaded database config', databaseConfig);

    // Print the exact URL and options that will be passed to mongoose.connect
    const url = databaseConfig.useProductionDatabase ? databaseConfig.urlProd : databaseConfig.urlDev;
    const options = databaseConfig.options || {};
    logger.info('Example', '[example.ts] Will connect to MongoDB with', { url, options });

    const context = await TitanKernel.create({
      autoScan: true,
      logging: {
        databaseAccess: false,
        logLevel: 'VERBOSE'
      },
      database: databaseConfig
    });

    logger.info('Example', '📊 Bootstrap Results:');
    logger.info('Example', `Services: ${context.services.size}`);
    logger.info('Example', `Controllers: ${context.controllers.length}`);
    logger.info('Example', `Gateways: ${context.gateways.length}`);
    logger.info('Example', `Socket Service Available: ${context.socket?.isReady() || false}`);

    // Check DB connection status
    if (context.database) {
      const dbReady = context.database.isReady();
      logger.info('Example', `🗄️  Database connection ready: ${dbReady}`);
    }

    // Test service resolution
    const exampleService = context.services.get('ExampleService') as ExampleService;
    if (exampleService) {
      const data = exampleService.getData();
      logger.info('Example', '✅ Service test:', data);
    }

    // Example of how to use socket service (when Socket.IO server is available)
    if (context.socket) {
      logger.info('Example', '🔌 Socket Service: Ready for Socket.IO integration');
      logger.info('Example', '   To initialize: context.socket.setServer(io)');
      logger.info('Example', '   To register events: context.socket.registerEvents((io) => { ... })');
      logger.info('Example', '   To broadcast: context.socket.emitToAll(event, data)');
    }

    logger.info('Example', '🎉 TitanKernel example completed successfully!');
  } catch (error) {
    const logger = new (require('./services/titan-logger.service').TitanLoggerService)();
    if (error instanceof Error) {
      logger.error('Example', '❌ Bootstrap failed:', { message: error.message, stack: error.stack });
    } else {
      logger.error('Example', '❌ Bootstrap failed:', { error });
    }
  }
}

// Run if this file is executed directly
if (require.main === module) {
  bootstrap();
}
