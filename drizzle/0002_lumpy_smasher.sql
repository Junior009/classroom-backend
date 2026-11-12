CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"class_id" integer NOT NULL,
	"student_id" text NOT NULL,
	"attendance_date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"marked_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"class_id" integer NOT NULL,
	"student_id" text NOT NULL,
	"assessment_name" varchar(255) NOT NULL,
	"score" real NOT NULL,
	"max_score" real NOT NULL,
	"assessment_date" date NOT NULL,
	"feedback" text,
	"graded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_graded_by_user_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_class_student_date_unique" ON "attendance_records" USING btree ("class_id","student_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_class_date_idx" ON "attendance_records" USING btree ("class_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_student_id_idx" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_class_student_assessment_unique" ON "grades" USING btree ("class_id","student_id","assessment_name");--> statement-breakpoint
CREATE INDEX "grades_class_id_idx" ON "grades" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "grades_student_id_idx" ON "grades" USING btree ("student_id");