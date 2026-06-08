import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ErrorTrackingEvent {
  requestId: string;
  path: string;
  method: string;
  statusCode: number;
  message: string;
  stack?: string;
}

@Injectable()
export class ErrorTrackingService {
  private readonly enabled: boolean;
  private readonly webhookUrl: string;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('ERROR_TRACKING_ENABLED') ?? true;
    this.webhookUrl = this.config.get<string>('ERROR_WEBHOOK_URL')?.trim() ?? '';
  }

  captureServerError(event: ErrorTrackingEvent): void {
    if (!this.enabled || this.webhookUrl.length === 0) {
      return;
    }

    void this.postEvent(event);
  }

  private async postEvent(event: ErrorTrackingEvent): Promise<void> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source: 'restaurant-pos-api',
          occurredAt: new Date().toISOString(),
          event,
        }),
      });

      if (!response.ok) {
        console.warn('[ErrorTrackingService] Webhook rejected error event', {
          statusCode: response.status,
          webhookUrl: this.webhookUrl,
          requestId: event.requestId,
        });
      }
    } catch (error) {
      console.warn('[ErrorTrackingService] Failed to publish error event', {
        webhookUrl: this.webhookUrl,
        requestId: event.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
