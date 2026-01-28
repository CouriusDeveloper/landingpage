// Supabase Edge Function: ai-orchestrator
// Starts the AI generation by calling ai-worker
// The browser may timeout, but the server keeps working

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const workerSecret = Deno.env.get('WORKER_SECRET') || 'internal-worker-key-2026'

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify auth (optional)
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    }

    const { projectId } = await req.json()
    if (!projectId) {
      throw new Error('Missing projectId')
    }

    console.log('AI Orchestrator: Starting for project:', projectId)

    // Update project status to generating
    await supabase
      .from('projects')
      .update({ status: 'generating' })
      .eq('id', projectId)

    // Log activity
    await supabase.from('activity_log').insert({
      project_id: projectId,
      actor_type: 'system',
      action: 'generation_started',
      customer_visible: true,
      customer_message: 'KI-Generierung gestartet...',
    })

    // Call the worker and WAIT for completion
    // Edge Functions have 300s timeout - plenty of time
    const workerUrl = `${supabaseUrl}/functions/v1/ai-worker`
    console.log('Calling worker at:', workerUrl)

    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify({ projectId }),
    })

    const workerResult = await workerResponse.json()
    console.log('Worker completed:', workerResult)

    if (!workerResponse.ok) {
      throw new Error(workerResult.error || 'Worker failed')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Generierung abgeschlossen',
        ...workerResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('AI Orchestrator error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
