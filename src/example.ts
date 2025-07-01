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
    const environment = this.config.get('environment', 'development');
    this.logger.debug('ExampleService', 'Getting data', { environment });
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

// Example gateway
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
}

// Bootstrap example
async function bootstrap() {
  try {
    console.log('🚀 Starting TitanKernel example...');
    
    const context = await TitanKernel.create({
      autoScan: true,
      logging: {
        databaseAccess: false
      }
    });

    console.log('\n📊 Bootstrap Results:');
    console.log(`Services: ${context.services.size}`);
    console.log(`Controllers: ${context.controllers.length}`);
    console.log(`Gateways: ${context.gateways.length}`);

    // Test service resolution
    const exampleService = context.services.get('ExampleService') as ExampleService;
    if (exampleService) {
      const data = exampleService.getData();
      console.log('\n✅ Service test:', data);
    }

    console.log('\n🎉 TitanKernel example completed successfully!');
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  bootstrap();
}
