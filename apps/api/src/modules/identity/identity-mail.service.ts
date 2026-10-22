import { Inject, Injectable } from '@nestjs/common';

import { AppConfig } from '../../platform/config/app-config.js';
import { renderEmail } from '../../platform/mail/layout.js';
import { MAILER, type Mailer } from '../../platform/mail/mailer.service.js';

const FOOTER =
  'You received this email because of an action on your AI Designer account. If it was not you, you can ignore it.';

/** Identity emails (verify, reset, existing-account notice). Links point to the web app. */
@Injectable()
export class IdentityMailService {
  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: AppConfig,
  ) {}

  private link(path: string, token: string): string {
    const url = new URL(path, this.config.env.APP_BASE_URL);
    url.searchParams.set('token', token);
    return url.toString();
  }

  async sendVerification(to: string, name: string, token: string): Promise<void> {
    const { html, text } = renderEmail({
      heading: 'Confirm your email address',
      paragraphs: [
        `Hi ${name},`,
        'Confirm your email address to activate your AI Designer account. The link is valid for 24 hours and can be used once.',
      ],
      action: { label: 'Confirm email', url: this.link('/verify-email', token) },
      footer: FOOTER,
    });
    await this.mailer.send({ to, subject: 'Confirm your email address', html, text });
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const { html, text } = renderEmail({
      heading: 'Reset your password',
      paragraphs: [
        `Hi ${name},`,
        'Someone asked to reset the password of your AI Designer account. The link is valid for 1 hour and can be used once. Resetting signs you out everywhere.',
      ],
      action: { label: 'Choose a new password', url: this.link('/reset-password', token) },
      footer: FOOTER,
    });
    await this.mailer.send({ to, subject: 'Reset your password', html, text });
  }

  /** Sent instead of a verification email when someone registers with an existing address. */
  async sendExistingAccountNotice(to: string, name: string): Promise<void> {
    const signIn = new URL('/sign-in', this.config.env.APP_BASE_URL).toString();
    const forgot = new URL('/forgot-password', this.config.env.APP_BASE_URL).toString();
    const { html, text } = renderEmail({
      heading: 'You already have an account',
      paragraphs: [
        `Hi ${name},`,
        'Someone tried to create an AI Designer account with this email address, which already has an account.',
        `If this was you, sign in at ${signIn} or reset your password at ${forgot}.`,
      ],
      footer: FOOTER,
    });
    await this.mailer.send({
      to,
      subject: 'Sign-in help for your AI Designer account',
      html,
      text,
    });
  }
}
