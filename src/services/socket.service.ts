import { Injectable } from '../decorators/injectable';
import { Server as SocketIOServer } from 'socket.io';
import { TitanLoggerService } from './titan-logger.service';

@Injectable()
export class SocketService {
  private io?: SocketIOServer;
  private pendingEventRegistrations: Array<(io: SocketIOServer) => void> = [];

  constructor(private logger: TitanLoggerService) {}

  setServer(io: SocketIOServer): void {
    this.io = io;
    this.logger.info('SocketService', 'Socket.IO server initialized successfully');
    
    // Process any pending registrations
    if (this.pendingEventRegistrations.length > 0) {
      this.logger.debug('SocketService', `Processing ${this.pendingEventRegistrations.length} pending socket event registrations`);
      this.pendingEventRegistrations.forEach(registerFn => registerFn(io));
      this.pendingEventRegistrations = [];
      this.logger.debug('SocketService', 'All pending socket event registrations processed');
    }

    // Connect logger to socket server
    this.logger.setSocketServer(io);
  }

  getServer(): SocketIOServer {
    if (!this.io) throw new Error('Socket.IO server not initialized');
    return this.io;
  }

  // Register event handlers for gateways
  registerEvents(registerFn: (io: SocketIOServer) => void): void {
    if (this.io) {
      registerFn(this.io);
    } else {
      this.pendingEventRegistrations.push(registerFn);
      this.logger.debug('SocketService', 'Socket event registration queued for later processing');
    }
  }

  // Broadcast to all connected clients
  emitToAll(event: string, payload: any): void {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }

  // Check if socket server is ready
  isReady(): boolean {
    return !!this.io;
  }
}
