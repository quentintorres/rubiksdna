CREATE TYPE "public"."evidence_source" AS ENUM('org_entered', 'self_reported');--> statement-breakpoint
CREATE TYPE "public"."intervention_category" AS ENUM('reprogramming', 'senolytic', 'mtor_modulating', 'nutrition', 'exercise', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'analyst', 'clinician', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('research', 'clinic');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('methylation_450k', 'methylation_epic', 'methylation_epic_v2', 'chem_panel', 'olink', 'telomere');--> statement-breakpoint
CREATE TYPE "public"."qc_status" AS ENUM('pending', 'passed', 'warned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male', 'unspecified');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clock_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"clock_id" text NOT NULL,
	"clock_version" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"value" numeric(10, 4),
	"ci_low" numeric(10, 4),
	"ci_high" numeric(10, 4),
	"probes_used" integer NOT NULL,
	"probes_imputed" integer NOT NULL,
	"refused_reason" text,
	"qc_flags" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"kind" text NOT NULL,
	"original_filename" text NOT NULL,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"parse_errors" jsonb,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delta_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"pre_value" numeric(12, 4) NOT NULL,
	"post_value" numeric(12, 4) NOT NULL,
	"delta" numeric(12, 4) NOT NULL,
	"mdc" numeric(12, 4) NOT NULL,
	"exceeds_mdc" boolean NOT NULL,
	"pipeline_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_interventions" (
	"episode_id" uuid NOT NULL,
	"intervention_id" uuid NOT NULL,
	CONSTRAINT "episode_interventions_episode_id_intervention_id_pk" PRIMARY KEY("episode_id","intervention_id")
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"pre_sample_id" uuid NOT NULL,
	"post_sample_id" uuid NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_matrices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"probe_count" integer NOT NULL,
	"pipeline_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hallmark_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"axis_key" text NOT NULL,
	"score" numeric(10, 4),
	"percentile" numeric(6, 3),
	"computable" boolean NOT NULL,
	"confidence" text NOT NULL,
	"inputs_used" jsonb NOT NULL,
	"inputs_missing" jsonb NOT NULL,
	"pipeline_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" "intervention_category" NOT NULL,
	"agent" text NOT NULL,
	"dose" text,
	"route" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"physician_supervised" boolean DEFAULT false NOT NULL,
	"evidence_source" "evidence_source" DEFAULT 'org_entered' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"analyte_key" text NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"unit" text NOT NULL,
	"below_loq" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "org_type" DEFAULT 'research' NOT NULL,
	"phi_enabled" boolean DEFAULT false NOT NULL,
	"region" text DEFAULT 'us-east-1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "probe_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"probe_id" text NOT NULL,
	"beta" numeric(10, 8) NOT NULL,
	"imputed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"episode_id" uuid,
	"object_key" text,
	"template_version" text NOT NULL,
	"disclaimer_version" text NOT NULL,
	"clock_versions" jsonb NOT NULL,
	"pipeline_version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"tissue" text DEFAULT 'whole_blood' NOT NULL,
	"platform" "platform" NOT NULL,
	"source_lab" text,
	"qc_status" "qc_status" DEFAULT 'pending' NOT NULL,
	"qc_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"chronological_age" numeric(5, 2),
	"sex" "sex" DEFAULT 'unspecified' NOT NULL,
	"model_system" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'pilot' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"report_credits" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"current_period_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"reported_ref" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_results" ADD CONSTRAINT "clock_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_results" ADD CONSTRAINT "clock_results_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_files" ADD CONSTRAINT "data_files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_files" ADD CONSTRAINT "data_files_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delta_results" ADD CONSTRAINT "delta_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delta_results" ADD CONSTRAINT "delta_results_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_interventions" ADD CONSTRAINT "episode_interventions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_interventions" ADD CONSTRAINT "episode_interventions_intervention_id_interventions_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."interventions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_pre_sample_id_samples_id_fk" FOREIGN KEY ("pre_sample_id") REFERENCES "public"."samples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_post_sample_id_samples_id_fk" FOREIGN KEY ("post_sample_id") REFERENCES "public"."samples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_matrices" ADD CONSTRAINT "feature_matrices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_matrices" ADD CONSTRAINT "feature_matrices_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallmark_scores" ADD CONSTRAINT "hallmark_scores_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallmark_scores" ADD CONSTRAINT "hallmark_scores_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_features" ADD CONSTRAINT "probe_features_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_features" ADD CONSTRAINT "probe_features_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_org_time_idx" ON "audit_events" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clock_results_sample_clock_idx" ON "clock_results" USING btree ("sample_id","clock_id","clock_version");--> statement-breakpoint
CREATE INDEX "clock_results_org_idx" ON "clock_results" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "data_files_org_idx" ON "data_files" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_files_key_idx" ON "data_files" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "delta_results_episode_metric_idx" ON "delta_results" USING btree ("episode_id","metric_key");--> statement-breakpoint
CREATE INDEX "delta_results_org_idx" ON "delta_results" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_samples_idx" ON "episodes" USING btree ("pre_sample_id","post_sample_id");--> statement-breakpoint
CREATE INDEX "episodes_org_idx" ON "episodes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hallmark_scores_sample_axis_idx" ON "hallmark_scores" USING btree ("sample_id","axis_key");--> statement-breakpoint
CREATE INDEX "hallmark_scores_org_idx" ON "hallmark_scores" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "interventions_subject_idx" ON "interventions" USING btree ("subject_id","started_at");--> statement-breakpoint
CREATE INDEX "interventions_org_idx" ON "interventions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_sample_analyte_idx" ON "measurements" USING btree ("sample_id","analyte_key");--> statement-breakpoint
CREATE INDEX "measurements_org_idx" ON "measurements" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_features_sample_probe_idx" ON "probe_features" USING btree ("sample_id","probe_id");--> statement-breakpoint
CREATE INDEX "probe_features_org_idx" ON "probe_features" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reports_org_idx" ON "reports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reports_subject_idx" ON "reports" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "samples_subject_idx" ON "samples" USING btree ("subject_id","collected_at");--> statement-breakpoint
CREATE INDEX "samples_org_idx" ON "samples" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_org_ref_idx" ON "subjects" USING btree ("org_id","external_ref");--> statement-breakpoint
CREATE INDEX "subjects_org_idx" ON "subjects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "usage_events_org_time_idx" ON "usage_events" USING btree ("org_id","occurred_at");