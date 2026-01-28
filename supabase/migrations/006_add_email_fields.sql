-- Add email/Resend fields to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS email_domain TEXT,
ADD COLUMN IF NOT EXISTS email_domain_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS resend_domain_id TEXT,
ADD COLUMN IF NOT EXISTS resend_dns_records JSONB;

-- Add comment for documentation
COMMENT ON COLUMN projects.contact_email IS 'Email address for receiving contact form submissions';
COMMENT ON COLUMN projects.email_domain IS 'Customer domain for sending emails (e.g. example.com)';
COMMENT ON COLUMN projects.email_domain_verified IS 'Whether DNS records have been verified by Resend';
COMMENT ON COLUMN projects.resend_domain_id IS 'Resend domain ID for API calls';
COMMENT ON COLUMN projects.resend_dns_records IS 'DNS records customer needs to add for domain verification';
