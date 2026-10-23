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

  /**
   * Account-security notice (FR-SEC-226…231): says what happened and when, never secrets, codes,
   * IPs or tokens; the link only opens the (authenticated) security settings page.
   */
  async sendSecurityNotice(to: string, name: string, notice: SecurityNotice): Promise<void> {
    const render = SECURITY_NOTICES[notice.kind] as (n: SecurityNotice) => {
      subject: string;
      heading: string;
      body: string;
    };
    const { subject, heading, body } = render(notice);
    const when = new Date().toUTCString();
    const { html, text } = renderEmail({
      heading,
      paragraphs: [
        `Hi ${name},`,
        body,
        `When: ${when}`,
        "If this wasn't you, change your password and review your sessions right away.",
      ],
      action: {
        label: 'Review account security',
        url: new URL('/settings/security', this.config.env.APP_BASE_URL).toString(),
      },
      footer: FOOTER,
    });
    await this.mailer.send({ to, subject, html, text });
  }
}

export type SecurityNotice =
  | { kind: 'mfa_enabled' }
  | { kind: 'mfa_disabled' }
  | { kind: 'recovery_codes_regenerated' }
  | { kind: 'recovery_code_used'; remaining: number }
  | { kind: 'password_changed' }
  | { kind: 'new_sign_in'; device: string };

const SECURITY_NOTICES: {
  [K in SecurityNotice['kind']]: (n: Extract<SecurityNotice, { kind: K }>) => {
    subject: string;
    heading: string;
    body: string;
  };
} = {
  mfa_enabled: () => ({
    subject: 'Two-step verification turned on',
    heading: 'Two-step verification is on',
    body: 'An authenticator app was added to your AI Designer account. Other sessions were signed out.',
  }),
  mfa_disabled: () => ({
    subject: 'Two-step verification turned off',
    heading: 'Two-step verification is off',
    body: 'The authenticator app was removed from your AI Designer account. Other sessions were signed out.',
  }),
  recovery_codes_regenerated: () => ({
    subject: 'New recovery codes created',
    heading: 'New recovery codes',
    body: 'New recovery codes were created for your account. The old codes no longer work.',
  }),
  recovery_code_used: (n) => ({
    subject: 'A recovery code was used to sign in',
    heading: 'Recovery code used',
    body: `Someone signed in to your account with a recovery code. ${n.remaining} unused code(s) remain.`,
  }),
  password_changed: () => ({
    subject: 'Your password was changed',
    heading: 'Password changed',
    body: 'The password of your AI Designer account was changed. Other sessions were signed out.',
  }),
  new_sign_in: (n) => ({
    subject: 'New sign-in to your account',
    heading: 'New sign-in',
    body: `Your account was signed in to from a device we have not seen before: ${n.device}.`,
  }),
};
