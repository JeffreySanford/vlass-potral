import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagingService } from './messaging.service';
import { MessagingMonitorService } from './messaging-monitor.service';
import { MessagingStatsService } from './messaging-stats.service';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Subscription, interval } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { AuthService, JwtPayload } from '../auth/auth.service';
import { getJwtSecret } from '../config/security.config';

function resolveAllowedOrigins(): string[] {
  const raw = process.env['FRONTEND_URL'] || 'http://localhost:4200';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    // Allow clients with no origin header (non-browser/internal tooling).
    return true;
  }
  return resolveAllowedOrigins().includes(origin);
}

function extractToken(client: Socket): string | null {
  const authToken = client.handshake.auth?.['token'];
  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken.trim();
  }

  const authorization = client.handshake.headers.authorization;
  if (typeof authorization !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) {
    return null;
  }
  return match[1].trim();
}

@WebSocketGateway({
  cors: {
    origin: resolveAllowedOrigins(),
    credentials: true,
  },
  namespace: 'messaging',
})
export class MessagingGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('MessagingGateway');
  private telemetrySubscription?: Subscription;
  private statsSubscription?: Subscription;

  constructor(
    private readonly messagingService: MessagingService,
    private readonly monitorService: MessagingMonitorService,
    private readonly statsService: MessagingStatsService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  afterInit() {
    this.logger.log('Messaging WebSocket Gateway Initialized');

    // Broadcast every transaction to keep the visual flow faithful to real traffic.
    this.telemetrySubscription = this.messagingService.telemetry$.subscribe(
      (packet) => {
        this.server.emit('telemetry_update', packet);
      },
    );

    this.statsSubscription = interval(1000).subscribe(() => {
      this.server.emit(
        'stats_update',
        this.statsService.getSnapshot(this.monitorService.getSnapshot()),
      );
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const origin = client.handshake.headers.origin;
    if (!isAllowedOrigin(origin)) {
      this.logger.warn(
        `Rejected messaging socket ${client.id}: disallowed origin ${origin ?? 'unknown'}`,
      );
      client.disconnect(true);
      return;
    }

    const token = extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected messaging socket ${client.id}: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: getJwtSecret(),
      });
      const user = await this.authService.getCurrentUser(payload.sub);
      if (!user) {
        this.logger.warn(
          `Rejected messaging socket ${client.id}: invalid user`,
        );
        client.disconnect(true);
        return;
      }

      client.data['userId'] = user.id;
      client.data['role'] = user.role;
      this.logger.log(`Client connected: ${client.id} user=${user.id}`);
    } catch (error) {
      this.logger.warn(
        `Rejected messaging socket ${client.id}: token validation failed (${(error as Error).message})`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  onModuleDestroy() {
    this.telemetrySubscription?.unsubscribe();
    this.statsSubscription?.unsubscribe();
  }
}
