CREATE TYPE "public"."attendance_method" AS ENUM('scan_barcode', 'scan_qr', 'manual_entry', 'self_checkin', 'manual');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('hadir', 'izin', 'sakit', 'tidak_hadir');--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"method" "attendance_method" NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text,
	"note" text,
	CONSTRAINT "attendance_session_member_unique" UNIQUE("session_id","member_id"),
	CONSTRAINT "attendance_manual_note" CHECK ("attendance"."method" <> 'manual' or "attendance"."note" is not null)
);
--> statement-breakpoint
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attendance_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"program" text NOT NULL,
	"hadir" integer DEFAULT 0 NOT NULL,
	"izin" integer DEFAULT 0 NOT NULL,
	"sakit" integer DEFAULT 0 NOT NULL,
	"tidak_hadir" integer DEFAULT 0 NOT NULL,
	"needs_verification" boolean DEFAULT false NOT NULL,
	"note" text,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_archives_member_program_unique" UNIQUE("member_id","program"),
	CONSTRAINT "attendance_archives_counts" CHECK ("attendance_archives"."hadir" >= 0 and "attendance_archives"."izin" >= 0 and "attendance_archives"."sakit" >= 0 and "attendance_archives"."tidak_hadir" >= 0)
);
--> statement-breakpoint
ALTER TABLE "attendance_archives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_members_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_archives" ADD CONSTRAINT "attendance_archives_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_archives" ADD CONSTRAINT "attendance_archives_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_archives" ADD CONSTRAINT "attendance_archives_imported_by_members_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_member_idx" ON "attendance" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "attendance_session_recorded_idx" ON "attendance" USING btree ("session_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_checkin_code_unique" ON "sessions" USING btree ("checkin_code");