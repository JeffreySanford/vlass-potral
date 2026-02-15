import { Injectable, Logger } from '@nestjs/common';

/**
 * NotificationService handles job completion and failure notifications
 * Supports multiple channels: email, in-app, WebSocket
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  // In-memory notification storage
  private readonly notificationsMap = new Map<string, any[]>();

  /**
   * Send job completion email notification
   */
  async sendJobCompletionEmail(options: {
    user_id: string;
    job_id: string;
    result_url: string;
    execution_time_seconds: number;
  }): Promise<void> {
    try {
      this.logger.log(
        `Sending completion email for job ${options.job_id} to user ${options.user_id}`,
      );
      // In production: call email service (SendGrid, SES, etc.)
      // For now: mock success
    } catch (error) {
      this.logger.error(`Failed to send completion email: ${error}`);
      throw error;
    }
  }

  /**
   * Send job failure notification
   */
  async sendJobFailureNotification(options: {
    user_id: string;
    job_id: string;
    error_message: string;
    error_code: number;
  }): Promise<void> {
    try {
      this.logger.log(
        `Sending failure notification for job ${options.job_id} to user ${options.user_id}`,
      );
      // In production: determine best channel (email, SMS, etc.)
      // For now: mock success
    } catch (error) {
      this.logger.error(`Failed to send failure notification: ${error}`);
      throw error;
    }
  }

  /**
   * Broadcast notification via WebSocket to connected clients
   */
  async broadcastViaWebSocket(notification: {
    type: string;
    job_id: string;
    user_id: string;
    timestamp?: string;
    data?: Record<string, any>;
  }): Promise<void> {
    try {
      this.logger.debug(
        `Broadcasting ${notification.type} notification for job ${notification.job_id}`,
      );
      // In production: emit via WebSocket gateway
      // For now: mock success
    } catch (error) {
      this.logger.error(`Failed to broadcast WebSocket notification: ${error}`);
      throw error;
    }
  }

  /**
   * Store in-app notification in database
   */
  async storeInAppNotification(notification: {
    user_id: string;
    job_id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
  }): Promise<void> {
    try {
      if (!this.notificationsMap.has(notification.user_id)) {
        this.notificationsMap.set(notification.user_id, []);
      }

      const userNotifications = this.notificationsMap.get(notification.user_id)!;
      userNotifications.push({
        ...notification,
        created_at: new Date().toISOString(),
      });

      this.logger.debug(
        `Stored in-app notification for user ${notification.user_id}`,
      );
    } catch (error) {
      this.logger.error(`Failed to store in-app notification: ${error}`);
      throw error;
    }
  }

  /**
   * Get unread notifications for user
   */
  async getUnreadNotifications(userId: string): Promise<any[]> {
    const notifications = this.notificationsMap.get(userId) || [];
    return notifications.filter((n) => !n.read);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, jobId: string): Promise<void> {
    const notifications = this.notificationsMap.get(userId) || [];
    const notification = notifications.find((n) => n.job_id === jobId);
    if (notification) {
      notification.read = true;
    }
  }
}
