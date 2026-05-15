export type UserRole = 'admin' | 'editor' | 'viewer';
export type ContactTag = 'hot' | 'warm' | 'cold';
export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed';
export type EmailEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'unsubscribed'
  | 'complained'
  | 'failed'
  | 'delivery_delayed';

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  email: string;
  name: string | null;
  /** Surname only. Populated by the CSV importer's "Split Name into First/Last" toggle, or set manually via the contact edit form. Renders in {{last_name}} merge tag. */
  last_name: string | null;
  phone: string | null;
  company: string | null;
  tag: ContactTag;
  status: ContactStatus;
  lists: string[];
  metadata: Record<string, unknown>;
  /** Free-form key/value bag for fields imported from CSV that don't match a standard column. Usable as `{{key}}` merge tags in campaigns. */
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContactList = {
  id: string;
  name: string;
  description: string | null;
  /** Free-form labels (origem, persona, evento) set by the operator. */
  tags: string[] | null;
  contact_count: number;
  created_at: string;
};

export type Template = {
  id: string;
  name: string;
  json_content: unknown;
  html_content: string;
  thumbnail_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  template_id: string | null;
  list_ids: string[];
  filter_tag: ContactTag | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  resend_broadcast_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type TrackedLink = {
  id: string;
  campaign_id: string;
  link_id: string;
  original_url: string;
  position: { top: number; left: number; width?: number; height?: number } | null;
  click_count: number;
  created_at: string;
};

export type EmailEvent = {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  event_type: EmailEventType;
  link_url: string | null;
  link_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  created_at: string;
};
