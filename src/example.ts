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
    this.logger.debug('ExampleService', 'Getting data', { environment, isProduction, fullConfig: config });
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
    console.log('🚀 Starting TitanKernel example...');

    // Print Node.js and Mongoose versions
    const mongoose = require('mongoose');
    console.log(`[example.ts] Node.js version: ${process.version}`);
    console.log(`[example.ts] Mongoose version: ${mongoose.version}`);

    // Load config from titan.config.json in the kernel folder
    const configPath = path.resolve(__dirname, '../titan.config.json');
    const configRaw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configRaw);
    const databaseConfig = config.database;
    console.log('[example.ts] Loaded database config:', databaseConfig);

    // Print the exact URL and options that will be passed to mongoose.connect
    const url = databaseConfig.useProductionDatabase ? databaseConfig.urlProd : databaseConfig.urlDev;
    const options = databaseConfig.options || {};
    console.log('[example.ts] Will connect to MongoDB with:', { url, options });

    const context = await TitanKernel.create({
      autoScan: true,
      logging: {
        databaseAccess: false
      },
      database: databaseConfig
    });

    console.log('\n📊 Bootstrap Results:');
    console.log(`Services: ${context.services.size}`);
    console.log(`Controllers: ${context.controllers.length}`);
    console.log(`Gateways: ${context.gateways.length}`);
    console.log(`Socket Service Available: ${context.socket?.isReady() || false}`);

    // Check DB connection status
    if (context.database) {
      const dbReady = context.database.isReady();
      console.log(`\n🗄️  Database connection ready: ${dbReady}`);
    }

    // Test service resolution
    const exampleService = context.services.get('ExampleService') as ExampleService;
    if (exampleService) {
      const data = exampleService.getData();
      console.log('\n✅ Service test:', data);
    }

    // Example of how to use socket service (when Socket.IO server is available)
    if (context.socket) {
      console.log('\n🔌 Socket Service: Ready for Socket.IO integration');
      console.log('   To initialize: context.socket.setServer(io)');
      console.log('   To register events: context.socket.registerEvents((io) => { ... })');
      console.log('   To broadcast: context.socket.emitToAll(event, data)');
    }

    console.log('\n🎉 TitanKernel example completed successfully!');
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Bootstrap failed:', error.message);
      console.error('❌ Full error stack:', error.stack);
    } else {
      console.error('❌ Bootstrap failed:', error);
    }
  }
}

// Run if this file is executed directly
if (require.main === module) {
  bootstrap();
}
