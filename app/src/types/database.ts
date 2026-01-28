export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          company: string | null
          role: 'customer' | 'admin'
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          company?: string | null
          role?: 'customer' | 'admin'
          created_at?: string
        }
        Update: {
          email?: string | null
          full_name?: string | null
          company?: string | null
          role?: 'customer' | 'admin'
        }
      }
      projects: {
        Row: {
          id: string
          owner_id: string
          name: string
          package_type: string
          status: string
          brief: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          package_type: string
          status?: string
          brief?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          package_type?: string
          status?: string
          brief?: string | null
          updated_at?: string
        }
      }
      project_phases: {
        Row: {
          id: string
          project_id: string
          phase: string
          status: string
          customer_visible_status: string | null
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          phase: string
          status?: string
          customer_visible_status?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          phase?: string
          status?: string
          customer_visible_status?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
      }
      ai_tasks: {
        Row: {
          id: string
          project_id: string
          phase_id: string | null
          task_type: string
          prompt: string
          context: Json | null
          status: 'queued' | 'running' | 'completed' | 'failed' | 'needs_human'
          ai_provider: string
          result: Json | null
          tokens_used: number | null
          estimated_cost: number | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          phase_id?: string | null
          task_type: string
          prompt: string
          context?: Json | null
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'needs_human'
          ai_provider: string
          result?: Json | null
          tokens_used?: number | null
          estimated_cost?: number | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'needs_human'
          result?: Json | null
          tokens_used?: number | null
          estimated_cost?: number | null
          completed_at?: string | null
        }
      }
      deliverables: {
        Row: {
          id: string
          project_id: string
          phase_id: string | null
          ai_task_id: string | null
          type: string
          name: string
          description: string | null
          file_url: string | null
          preview_url: string | null
          version: number
          customer_visible: boolean
          approved_for_customer_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          phase_id?: string | null
          ai_task_id?: string | null
          type: string
          name: string
          description?: string | null
          file_url?: string | null
          preview_url?: string | null
          version?: number
          customer_visible?: boolean
          approved_for_customer_at?: string | null
          created_at?: string
        }
        Update: {
          description?: string | null
          file_url?: string | null
          preview_url?: string | null
          version?: number
          customer_visible?: boolean
          approved_for_customer_at?: string | null
        }
      }
      feedback: {
        Row: {
          id: string
          deliverable_id: string
          author_id: string
          status: 'approved' | 'changes_requested' | 'pending'
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          deliverable_id: string
          author_id: string
          status?: 'approved' | 'changes_requested' | 'pending'
          comment?: string | null
          created_at?: string
        }
        Update: {
          status?: 'approved' | 'changes_requested' | 'pending'
          comment?: string | null
        }
      }
      activity_log: {
        Row: {
          id: string
          project_id: string
          actor_type: 'human' | 'ai' | 'system'
          actor_id: string | null
          action: string
          details: Json | null
          customer_visible: boolean
          customer_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          actor_type: 'human' | 'ai' | 'system'
          actor_id?: string | null
          action: string
          details?: Json | null
          customer_visible?: boolean
          customer_message?: string | null
          created_at?: string
        }
        Update: {
          action?: string
          details?: Json | null
          customer_visible?: boolean
          customer_message?: string | null
        }
      }
      invoices: {
        Row: {
          id: string
          project_id: string
          amount_total: number
          amount_paid: number
          status: string
          due_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          amount_total: number
          amount_paid?: number
          status?: string
          due_date?: string | null
          created_at?: string
        }
        Update: {
          amount_paid?: number
          status?: string
          due_date?: string | null
        }
      }
      payments: {
        Row: {
          id: string
          invoice_id: string
          provider: string
          amount: number
          status: string
          provider_reference: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          provider: string
          amount: number
          status?: string
          provider_reference?: string | null
          created_at?: string
        }
        Update: {
          status?: string
          provider_reference?: string | null
        }
      }
      ai_cost_tracking: {
        Row: {
          id: string
          project_id: string
          ai_task_id: string | null
          provider: string
          tokens_input: number
          tokens_output: number
          cost_usd: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          ai_task_id?: string | null
          provider: string
          tokens_input: number
          tokens_output: number
          cost_usd: number
          created_at?: string
        }
        Update: {
          tokens_input?: number
          tokens_output?: number
          cost_usd?: number
        }
      }
      preview_deployments: {
        Row: {
          id: string
          project_id: string
          url: string
          visible_to_customer: boolean
          released_by_admin_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          url: string
          visible_to_customer?: boolean
          released_by_admin_at?: string | null
          created_at?: string
        }
        Update: {
          url?: string
          visible_to_customer?: boolean
          released_by_admin_at?: string | null
        }
      }
      package_pricing: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          max_pages: number
          price_cents: number
          stripe_price_id: string | null
          active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          max_pages: number
          price_cents: number
          stripe_price_id?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          slug?: string
          name?: string
          description?: string | null
          max_pages?: number
          price_cents?: number
          stripe_price_id?: string | null
          active?: boolean
          sort_order?: number
          updated_at?: string
        }
      }
      addon_pricing: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          price_cents: number
          price_type: 'fixed' | 'per_page'
          stripe_price_id: string | null
          active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          price_cents: number
          price_type?: 'fixed' | 'per_page'
          stripe_price_id?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          slug?: string
          name?: string
          description?: string | null
          price_cents?: number
          price_type?: 'fixed' | 'per_page'
          stripe_price_id?: string | null
          active?: boolean
          sort_order?: number
          updated_at?: string
        }
      }
      hosting_pricing: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          includes_cms: boolean
          price_cents_monthly: number
          min_months: number
          notice_months: number
          stripe_price_id: string | null
          active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          includes_cms?: boolean
          price_cents_monthly: number
          min_months?: number
          notice_months?: number
          stripe_price_id?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          slug?: string
          name?: string
          description?: string | null
          includes_cms?: boolean
          price_cents_monthly?: number
          min_months?: number
          notice_months?: number
          stripe_price_id?: string | null
          active?: boolean
          sort_order?: number
          updated_at?: string
        }
      }
      // Multi-Agent System: Content Packs
      project_content_packs: {
        Row: {
          id: string
          project_id: string
          hash: string
          content: Json
          quality_score: number
          generated_at: string
          generation_duration: number
          agent_metrics: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          hash: string
          content: Json
          quality_score?: number
          generated_at: string
          generation_duration?: number
          agent_metrics?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          hash?: string
          content?: Json
          quality_score?: number
          generated_at?: string
          generation_duration?: number
          agent_metrics?: Json
          updated_at?: string
        }
      }
      // Multi-Agent System: Agent Metrics
      agent_metrics: {
        Row: {
          id: string
          project_id: string
          content_pack_id: string | null
          agent_name: string
          phase: string
          duration: number
          tokens_used: number
          success: boolean
          error_code: string | null
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          content_pack_id?: string | null
          agent_name: string
          phase: string
          duration: number
          tokens_used?: number
          success: boolean
          error_code?: string | null
          error_message?: string | null
          created_at?: string
        }
        Update: {
          agent_name?: string
          phase?: string
          duration?: number
          tokens_used?: number
          success?: boolean
          error_code?: string | null
          error_message?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Multi-Agent System Types
export interface ContentPackQualityScores {
  overall: number
  contentQuality: number
  brandConsistency: number
  seoOptimization: number
  accessibility: number
  technicalAccuracy: number
  feedback: string[]
}

export interface ContentPackSummary {
  id: string
  projectId: string
  hash: string
  qualityScore: number
  generatedAt: string
  generationDuration: number
  pageCount: number
  sectionCount: number
  hasBlog: boolean
  hasLegal: boolean
}