CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"lemonsqueezy_customer_id" text,
	"lemonsqueezy_subscription_id" text,
	"runs_this_month" integer DEFAULT 0 NOT NULL,
	"runs_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"compute_ms_used" bigint DEFAULT 0 NOT NULL,
	"compute_ms_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mcp_api_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_mcp_api_key_unique" UNIQUE("mcp_api_key")
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT false NOT NULL,
	"webhook_token" text,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"success_runs" integer DEFAULT 0 NOT NULL,
	"error_runs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"workflow_id" integer NOT NULL,
	"workflow_name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"billable_compute_ms" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"node_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_data" jsonb,
	"paused_at_node_id" text,
	"resume_context" jsonb,
	"waiting_for_approval" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"node_id" text NOT NULL,
	"workflow_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Approval Required' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"approver_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deadline_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"decider_email" text,
	"response_note" text,
	"approve_token" text NOT NULL,
	"reject_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"approval_mode" text DEFAULT 'any' NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_approvers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_approver_idx" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar(20) DEFAULT 'saml' NOT NULL,
	"entity_id" text,
	"acs_url" text,
	"x509_certificate" text,
	"metadata_url" text,
	"oidc_client_id" text,
	"oidc_client_secret" text,
	"oidc_issuer_url" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sso_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"nodes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changelog" text
);
--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;