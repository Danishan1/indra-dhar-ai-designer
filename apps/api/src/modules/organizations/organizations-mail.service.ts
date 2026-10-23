import { type OrgRoleKey, OrgRoleLabels } from '@ai-designer/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { AppConfig } from '../../platform/config/app-config.js';
import { renderEmail } from '../../platform/mail/layout.js';
import { MAILER, type Mailer } from '../../platform/mail/mailer.service.js';

@Injectable()
export class OrganizationsMailService {
  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: AppConfig,
  ) {}

  async sendInvitation(input: {
    to: string;
    organizationName: string;
    inviterName: string;
    roles: OrgRoleKey[];
    token: string;
  }): Promise<void> {
    const url = new URL('/invitations/accept', this.config.env.APP_BASE_URL);
    url.searchParams.set('token', input.token);
    const roleText = input.roles.map((r) => OrgRoleLabels[r]).join(', ');
    const { html, text } = renderEmail({
      heading: `Join ${input.organizationName} on AI Designer`,
      paragraphs: [
        `${input.inviterName} invited you to join ${input.organizationName} as ${roleText}.`,
        'The invitation is valid for 7 days and can be used once, by the person this email was sent to.',
      ],
      action: { label: 'View invitation', url: url.toString() },
      footer: 'If you were not expecting this invitation, you can ignore this email.',
    });
    await this.mailer.send({
      to: input.to,
      subject: `Invitation to join ${input.organizationName}`,
      html,
      text,
    });
  }
}
