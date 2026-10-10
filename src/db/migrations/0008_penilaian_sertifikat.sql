CREATE TYPE "public"."assessment_kind" AS ENUM('score', 'done_flag', 'attendance');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('eligible', 'not_eligible');--> statement-breakpoint
CREATE TABLE "assessment_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "assessment_kind" NOT NULL,
	"weight" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_components_class_key_unique" UNIQUE("class_id","key"),
	CONSTRAINT "assessment_components_weight_range" CHECK ("assessment_components"."weight" between 0 and 100),
	CONSTRAINT "assessment_components_key_format" CHECK ("assessment_components"."key" ~ '^[a-z0-9_]{2,40}$')
);
--> statement-breakpoint
ALTER TABLE "assessment_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_scores" (
	"component_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"value" numeric(5, 2),
	"done" boolean,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_scores_component_id_member_id_pk" PRIMARY KEY("component_id","member_id"),
	CONSTRAINT "assessment_scores_value_range" CHECK ("assessment_scores"."value" is null or ("assessment_scores"."value" >= 0 and "assessment_scores"."value" <= 100))
);
--> statement-breakpoint
ALTER TABLE "assessment_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificate_overrides" (
	"class_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "certificate_status" NOT NULL,
	"note" text NOT NULL,
	"overridden_by" uuid,
	"overridden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_overrides_class_id_member_id_pk" PRIMARY KEY("class_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "certificate_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificate_rules" (
	"class_id" uuid PRIMARY KEY NOT NULL,
	"rule" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificate_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_component_id_assessment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."assessment_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_updated_by_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_overrides" ADD CONSTRAINT "certificate_overrides_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_overrides" ADD CONSTRAINT "certificate_overrides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_overrides" ADD CONSTRAINT "certificate_overrides_overridden_by_members_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_rules" ADD CONSTRAINT "certificate_rules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_rules" ADD CONSTRAINT "certificate_rules_updated_by_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;