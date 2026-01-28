// Supabase Edge Function: create-final-payment
// Creates a Stripe Checkout session for the remaining 50% payment

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface FinalPaymentRequest {
  invoiceId: string
  successUrl: string
  cancelUrl: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const body: FinalPaymentRequest = await req.json()
    const { invoiceId, successUrl, cancelUrl } = body

    // Get invoice with project info
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        amount_total,
        amount_paid,
        status,
        project_id,
        projects!inner(id, name, offer_id)
      `)
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found')
    }

    // Verify user owns this project
    if ((invoice.projects as any).offer_id !== user.id) {
      throw new Error('Access denied')
    }

    // Calculate remaining amount
    const remainingAmount = invoice.amount_total - invoice.amount_paid
    if (remainingAmount <= 0) {
      throw new Error('Invoice is already fully paid')
    }

    const remainingCents = Math.round(remainingAmount * 100)

    // Create Stripe Checkout Session for final payment
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: remainingCents,
            product_data: {
              name: `Restzahlung: ${(invoice.projects as any).name}`,
              description: 'Restzahlung für Website-Projekt (50%)',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: invoiceId,
        project_id: invoice.project_id,
        user_id: user.id,
        type: 'final_payment',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
