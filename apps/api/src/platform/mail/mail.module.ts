import { Global, Module } from '@nestjs/common';

import { MAILER, SmtpMailer } from './mailer.service.js';

@Global()
@Module({
  providers: [SmtpMailer, { provide: MAILER, useExisting: SmtpMailer }],
  exports: [MAILER],
})
export class MailModule {}
