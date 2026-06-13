CREATE TABLE IF NOT EXISTS "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"predicted_score" integer NOT NULL,
	"rank_band" text NOT NULL,
	"confidence" real NOT NULL,
	"weighted_mastery" real NOT NULL,
	"coverage" real NOT NULL,
	"levers" jsonb NOT NULL,
	"model_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
