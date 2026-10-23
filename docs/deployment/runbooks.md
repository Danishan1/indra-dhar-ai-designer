# Operator runbooks

Procedures for platform operators. Each one is audited; follow it exactly and record the ticket.

## Lost second factor (user)

A user who lost the authenticator app signs in with one of their **recovery codes** (Sign in → "Use
a recovery code"). Turning the old app off needs a current code, so if they have no device at all an
operator resets the factor. Until a self-service reset exists:

1. Verify the person's identity out of band (two independent signals: account email + a second
   channel known to the organization owner). Never act on an email or chat request alone.
2. Run, against the production database, inside a transaction:
   `DELETE FROM mfa_factors WHERE user_id = '<id>'; DELETE FROM mfa_recovery_codes WHERE user_id = '<id>'; DELETE FROM sessions WHERE user_id = '<id>';`
3. Record an audit event (`identity.mfa.reset_by_operator`, reason + ticket) and tell the user to
   sign in and set up a new app immediately.

(Platform admin tooling for this arrives with the admin console, I45.)

## Last owner lost access (FR-SEC-082)

An organization must keep an owner. If its only owner cannot sign in at all (lost password and
email, or lost second factor and recovery codes):

1. Require a written request from the organization (another admin, or the billing contact) plus an
   identity check of the person who will become owner.
2. Either restore the owner's access (password reset by email; second factor reset as above), or —
   with the organization's written consent — perform an ownership transfer on their behalf: add the
   `organization_owner` role to the agreed active member (`membership_roles`), keep the previous
   owner's membership, and record `organizations.ownership.transferred` with
   `metadata.by_operator = true` and the ticket id.
3. Operators never become owners themselves (FR-SEC-083).

## Rotating `SECRETS_MASTER_KEY`

Rotation tooling (key ids, re-wrapping data keys) arrives with I22. Until then the key must not
change: losing it makes all TOTP secrets unreadable (users then need the second-factor reset above).
Back it up with the database credentials, never in the database itself.
