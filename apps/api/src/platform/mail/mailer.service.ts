import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { AppConfig } from '../config/app-config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const MAILER = Symbol('MAILER');

/** Minimal mail port (I05). The notification engine (I29) builds on it. Tests use Mailpit. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** SMTP mailer (Mailpit in development: http://localhost:8025). Never logs message bodies (tokens). */
@Injectable()
export class SmtpMailer implements Mailer, OnModuleDestroy {
  private readonly logger = new Logger('Mailer');
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    this.transport = nodemailer.createTransport(config.env.SMTP_URL);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.env.MAIL_FROM, ...message });
    this.logger.log({ subject: message.subject }, 'email sent');
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
