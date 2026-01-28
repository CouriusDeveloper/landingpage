// =============================================================================
// EDGE FUNCTION: Chat Message Notification
// Sendet Email-Benachrichtigungen bei neuen Chat-Nachrichten
// Mit Cooldown um Spam zu vermeiden
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/agent-utils.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const NOTIFICATION_COOLDOWN_MINUTES = 5

interface WebhookPayload {
  type: 'INSERT'
  table: 'project_messages'
  record: {
    id: string
    project_id: string
    sender_type: 'client' | 'admin'
    sender_id: string | null
    message_type: 'text' | 'change_request'
    content: string
    change_category?: string | null
    screenshot_url?: string | null
    created_at: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: WebhookPayload = await req.json()
    const { record } = payload
    
    console.log(`[CHAT-NOTIFY] New message from ${record.sender_type} in project ${record.project_id}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get project details
    const { data: project } = await supabase
      .from('projects')
      .select('name, contact_email, offer_id')
      .eq('id', record.project_id)
      .single()

    if (!project) {
      console.log('[CHAT-NOTIFY] Project not found')
      return new Response(JSON.stringify({ success: false, error: 'Project not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Determine recipient
    let recipientEmail: string | null = null
    let recipientType: 'admin' | 'client' = 'admin'
    
    if (record.sender_type === 'client') {
      // Client sent message → notify admin
      recipientEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'admin@example.com'
      recipientType = 'admin'
    } else {
      // Admin sent message → notify client
      recipientEmail = project.contact_email
      recipientType = 'client'
      
      // If no contact_email, try to get user email
      if (!recipientEmail && project.offer_id) {
        const { data: user } = await supabase.auth.admin.getUserById(project.offer_id)
        recipientEmail = user?.user?.email || null
      }
    }

    if (!recipientEmail) {
      console.log('[CHAT-NOTIFY] No recipient email found')
      return new Response(JSON.stringify({ success: false, error: 'No recipient' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check cooldown
    const cutoffTime = new Date(Date.now() - NOTIFICATION_COOLDOWN_MINUTES * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('notification_log')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', record.project_id)
      .eq('recipient_type', recipientType)
      .eq('notification_type', 'chat_message')
      .gte('sent_at', cutoffTime)

    if (count && count > 0) {
      console.log(`[CHAT-NOTIFY] Cooldown active, skipping notification`)
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'cooldown' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.log('[CHAT-NOTIFY] No RESEND_API_KEY, skipping email')
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_api_key' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isChangeRequest = record.message_type === 'change_request'
    const categoryLabel = record.change_category 
      ? { design: 'Design', text: 'Text', functionality: 'Funktion', bug: 'Fehler', other: 'Sonstiges' }[record.change_category] 
      : null

    const subject = recipientType === 'admin'
      ? `Neue ${isChangeRequest ? 'Änderungsanfrage' : 'Nachricht'} - ${project.name}`
      : `Antwort zu Ihrem Projekt "${project.name}"`

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0F172A;">${subject}</h2>
        ${isChangeRequest && categoryLabel ? `<p style="color: #6B7280;"><strong>Kategorie:</strong> ${categoryLabel}</p>` : ''}
        <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="color: #1F2937; white-space: pre-wrap;">${record.content}</p>
        </div>
        ${record.screenshot_url ? `<p><a href="${record.screenshot_url}" style="color: #059669;">Screenshot ansehen</a></p>` : ''}
        <p style="margin-top: 24px;">
          <a href="${Deno.env.get('APP_URL') || 'https://app.example.com'}/projects/${record.project_id}" 
             style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
            Im Portal antworten
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #9CA3AF; font-size: 12px;">
          Diese E-Mail wurde automatisch gesendet. Sie erhalten maximal eine Benachrichtigung alle ${NOTIFICATION_COOLDOWN_MINUTES} Minuten.
        </p>
      </div>
    `

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Projekt-Update <noreply@' + (Deno.env.get('EMAIL_DOMAIN') || 'example.com') + '>',
        to: recipientEmail,
        subject,
        html: htmlBody,
      }),
    })

    const emailResult = await emailResponse.json()
    
    if (!emailResponse.ok) {
      console.error('[CHAT-NOTIFY] Email error:', emailResult)
      throw new Error(emailResult.message || 'Email failed')
    }

    console.log(`[CHAT-NOTIFY] Email sent to ${recipientEmail}`)

    // Log notification
    await supabase.from('notification_log').insert({
      project_id: record.project_id,
      recipient_type: recipientType,
      recipient_email: recipientEmail,
      notification_type: 'chat_message',
      message_id: record.id,
      sent_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({ success: true, emailId: emailResult.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[CHAT-NOTIFY] Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
