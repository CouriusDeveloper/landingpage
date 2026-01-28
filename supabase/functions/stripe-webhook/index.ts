// Supabase Edge Function: stripe-webhook
// Deploy with: supabase functions deploy stripe-webhook

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
  })

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  try {
    const body = await req.text()
    console.log('Webhook received, verifying signature...')
    
    // Use async version for Deno compatibility
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
    console.log('Event verified:', event.type)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { project_id, invoice_id, user_id, type } = session.metadata ?? {}
        console.log('Checkout completed - metadata:', { project_id, invoice_id, type })

        const amountPaid = (session.amount_total ?? 0) / 100
        console.log('Amount paid:', amountPaid)

        if (type === 'deposit' && project_id) {
          // Handle deposit payment (50% Anzahlung)
          console.log('Processing deposit for project:', project_id)
          
          // Update invoice
          const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .select('id, amount_paid, amount_total')
            .eq('project_id', project_id)
            .single()
          
          console.log('Found invoice:', invoice, 'Error:', invoiceError)

          if (invoice) {
            const newAmountPaid = invoice.amount_paid + amountPaid
            const isPaid = newAmountPaid >= invoice.amount_total

            const { error: updateError } = await supabase
              .from('invoices')
              .update({
                amount_paid: newAmountPaid,
                status: isPaid ? 'paid' : 'partial',
              })
              .eq('id', invoice.id)
            
            console.log('Invoice update error:', updateError)

            // Create payment record
            const { error: paymentError } = await supabase.from('payments').insert({
              invoice_id: invoice.id,
              provider: 'stripe',
              amount: amountPaid,
              status: 'completed',
              provider_reference: session.payment_intent as string,
            })
            
            console.log('Payment insert error:', paymentError)
          }

          // Update project status to start discovery phase
          const { error: projectError } = await supabase
            .from('projects')
            .update({ status: 'discovery' })
            .eq('id', project_id)
          
          console.log('Project update error:', projectError)

          // Update phase status
          const { error: phaseError } = await supabase
            .from('project_phases')
            .update({
              status: 'in_progress',
              started_at: new Date().toISOString(),
              customer_visible_status: 'Anzahlung erhalten – Projekt startet!',
            })
            .eq('project_id', project_id)
            .eq('phase', 'discovery')
          
          console.log('Phase update error:', phaseError)

          // Log activity
          await supabase.from('activity_log').insert({
            project_id,
            actor_type: 'system',
            actor_id: null,
            action: 'payment_received',
            details: { amount: amountPaid, currency: 'EUR', type: 'deposit' },
            customer_visible: true,
            customer_message: `Anzahlung von ${amountPaid.toFixed(2)} € erhalten. Projekt startet!`,
          })
          
          console.log('Deposit payment processed successfully')
        } else if (type === 'final_payment' && invoice_id) {
          // Handle final payment (50% Restzahlung)
          
          // Update invoice
          const { data: invoice } = await supabase
            .from('invoices')
            .select('id, amount_paid, amount_total, project_id')
            .eq('id', invoice_id)
            .single()

          if (invoice) {
            const newAmountPaid = invoice.amount_paid + amountPaid
            const isPaid = newAmountPaid >= invoice.amount_total

            await supabase
              .from('invoices')
              .update({
                amount_paid: newAmountPaid,
                status: isPaid ? 'paid' : 'partial',
              })
              .eq('id', invoice.id)

            // Create payment record
            await supabase.from('payments').insert({
              invoice_id: invoice.id,
              provider: 'stripe',
              amount: amountPaid,
              status: 'completed',
              provider_reference: session.payment_intent as string,
            })

            // Log activity
            await supabase.from('activity_log').insert({
              project_id: invoice.project_id,
              actor_type: 'system',
              actor_id: null,
              action: 'payment_received',
              details: { amount: amountPaid, currency: 'EUR', type: 'final_payment' },
              customer_visible: true,
              customer_message: isPaid 
                ? `Restzahlung von ${amountPaid.toFixed(2)} € erhalten. Rechnung vollständig bezahlt!`
                : `Zahlung von ${amountPaid.toFixed(2)} € erhalten.`,
            })

            // If fully paid, update project for launch phase
            if (isPaid) {
              await supabase
                .from('projects')
                .update({ status: 'ready_for_launch' })
                .eq('id', invoice.project_id)
            }
          }
        }

        break
      }

      case 'invoice.paid': {
        // Handle subscription payments (hosting)
        const stripeInvoice = event.data.object as Stripe.Invoice
        const subscriptionId = stripeInvoice.subscription as string
        console.log('Subscription invoice paid:', subscriptionId)
        // TODO: Link subscription to project and track hosting payments
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(`Webhook error: ${err.message}`, { status: 400 })
  }
})
