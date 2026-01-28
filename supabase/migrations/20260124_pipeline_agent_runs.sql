-- =============================================================================
-- PIPELINE RUNS - Tracks each complete generation run
-- =============================================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  correlation_id VARCHAR(50) NOT NULL,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6',
    'completed', 'failed', 'needs_human', 'cancelled'
  )),
  current_phase INTEGER DEFAULT 0,
  current_agent VARCHAR(50),
  
  -- Input snapshot for reproducibility
  input_snapshot JSONB NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  
  -- Results
  final_content_pack_id UUID REFERENCES project_content_packs(id),
  files_generated INTEGER DEFAULT 0,
  quality_score DECIMAL(3,1),
  preview_url TEXT,
  
  -- Retry tracking
  total_retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Error handling
  error_code VARCHAR(50),
  error_message TEXT,
  error_agent VARCHAR(50),
  
  -- Cost tracking
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10,6) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AGENT RUNS - Tracks each individual agent execution
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Agent identification
  agent_name VARCHAR(50) NOT NULL,
  phase INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  
  -- Input/Output storage (for inter-agent communication)
  input_data JSONB,
  output_data JSONB,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),
  
  -- Metrics
  model_used VARCHAR(50),
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  cost_usd DECIMAL(10,6),
  
  -- Quality assessment
  quality_score DECIMAL(3,1),
  validation_passed BOOLEAN,
  validation_errors JSONB,
  
  -- Retry handling
  attempt INTEGER DEFAULT 1,
  retry_reason TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error details
  error_code VARCHAR(50),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_project ON pipeline_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_correlation ON pipeline_runs(correlation_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_pipeline ON agent_runs(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_runs_lookup ON agent_runs(pipeline_run_id, agent_name, status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_phase ON agent_runs(pipeline_run_id, phase);

-- =============================================================================
-- REALTIME - Enable for admin dashboard
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION update_pipeline_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pipeline_runs_updated_at ON pipeline_runs;
CREATE TRIGGER trigger_pipeline_runs_updated_at
  BEFORE UPDATE ON pipeline_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_runs_updated_at();
