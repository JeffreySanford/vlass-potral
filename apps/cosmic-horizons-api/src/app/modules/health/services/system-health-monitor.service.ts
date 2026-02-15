import { Injectable, Logger } from '@nestjs/common';

export interface HealthMetric {
  job_id: string;
  timestamp: string;
  error_rate: number; // 0-100
  consumer_lag: number; // in milliseconds
  available_memory_mb: number;
  cpu_usage_percent: number;
}

export interface HealthStatus {
  overall_healthy: boolean;
  error_rate_threshold_exceeded: boolean;
  consumer_lag_threshold_exceeded: boolean;
  alerts: string[];
  last_check: string;
}

/**
 * SystemHealthMonitorService tracks system health metrics
 * Monitors error rates, consumer lag, resource usage
 */
@Injectable()
export class SystemHealthMonitorService {
  private readonly logger = new Logger('SystemHealthMonitorService');

  // Configuration thresholds
  private readonly ERROR_RATE_THRESHOLD = 5; // 5%
  private readonly CONSUMER_LAG_THRESHOLD = 10000; // 10 seconds in ms

  // In-memory health state
  private readonly healthMetrics = new Map<string, HealthMetric>();
  private readonly alerts: string[] = [];
  private lastHealthCheck: string | null = null;

  /**
   * Process health event from Kafka
   */
  async processHealthEvent(metric: HealthMetric): Promise<void> {
    try {
      this.logger.debug(
        `Processing health metric for job ${metric.job_id}: error_rate=${metric.error_rate}%, lag=${metric.consumer_lag}ms`,
      );

      // Store metric
      this.healthMetrics.set(metric.job_id, metric);

      // Check thresholds
      await this.checkErrorRateThreshold(metric);
      await this.checkConsumerLagThreshold(metric);

      // Update last check time
      this.lastHealthCheck = new Date().toISOString();
    } catch (error) {
      this.logger.error(`Failed to process health event: ${error}`);
      throw error;
    }
  }

  /**
   * Check if error rate exceeds threshold
   */
  private async checkErrorRateThreshold(metric: HealthMetric): Promise<void> {
    try {
      if (metric.error_rate > this.ERROR_RATE_THRESHOLD) {
        const alert = `High error rate detected for job ${metric.job_id}: ${metric.error_rate}%`;
        this.logger.warn(alert);
        await this.triggerAlert(alert);
      }
    } catch (error) {
      this.logger.error(`Failed to check error rate threshold: ${error}`);
      throw error;
    }
  }

  /**
   * Check if consumer lag exceeds threshold
   */
  private async checkConsumerLagThreshold(metric: HealthMetric): Promise<void> {
    try {
      if (metric.consumer_lag > this.CONSUMER_LAG_THRESHOLD) {
        const alert = `High consumer lag detected for job ${metric.job_id}: ${metric.consumer_lag}ms`;
        this.logger.warn(alert);
        await this.triggerAlert(alert);
      }
    } catch (error) {
      this.logger.error(`Failed to check consumer lag threshold: ${error}`);
      throw error;
    }
  }

  /**
   * Trigger alert for threshold violation
   */
  async triggerAlert(alertMessage: string): Promise<void> {
    try {
      this.alerts.push(alertMessage);

      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts.shift();
      }

      this.logger.warn(`Alert triggered: ${alertMessage}`);

      // In production: send to alerting system (PagerDuty, Slack, etc.)
    } catch (error) {
      this.logger.error(`Failed to trigger alert: ${error}`);
      throw error;
    }
  }

  /**
   * Get current system health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      const metrics = Array.from(this.healthMetrics.values());

      const errorRateExceeded = metrics.some(
        (m) => m.error_rate > this.ERROR_RATE_THRESHOLD,
      );
      const consumerLagExceeded = metrics.some(
        (m) => m.consumer_lag > this.CONSUMER_LAG_THRESHOLD,
      );

      const status: HealthStatus = {
        overall_healthy: !errorRateExceeded && !consumerLagExceeded,
        error_rate_threshold_exceeded: errorRateExceeded,
        consumer_lag_threshold_exceeded: consumerLagExceeded,
        alerts: [...this.alerts],
        last_check: this.lastHealthCheck || 'never',
      };

      this.logger.debug(`Health status: ${JSON.stringify(status)}`);
      return status;
    } catch (error) {
      this.logger.error(`Failed to get health status: ${error}`);
      throw error;
    }
  }

  /**
   * Clear health metrics (for testing)
   */
  clearMetrics(): void {
    this.healthMetrics.clear();
    this.alerts.length = 0;
    this.lastHealthCheck = null;
  }

  /**
   * Get all health metrics (for testing)
   */
  getAllMetrics(): HealthMetric[] {
    return Array.from(this.healthMetrics.values());
  }

  /**
   * Get alerts (for testing)
   */
  getAlerts(): string[] {
    return [...this.alerts];
  }
}
