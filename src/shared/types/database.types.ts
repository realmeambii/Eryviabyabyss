/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Generated database types — the single source of truth for row shapes.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Regenerate after every migration:
 *
 *      npm run db:types            # against the local stack
 *      npm run db:types:remote     # against the linked project
 *
 *  Nothing in `src/` should redeclare a table's shape. Derive instead:
 *
 *      import type { Tables } from '@/shared/types';
 *      type Student = Tables<'students'>;
 *
 *  Hand-maintained until the first `supabase start`, and kept byte-compatible
 *  with the CLI's output so the first regeneration is a no-op — except for the
 *  `Relationships` metadata, which the CLI adds and nothing in the app reads.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)';
  };
  public: {
    Tables: {
      academic_sessions: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          is_current: boolean;
          name: string;
          school_id: string;
          starts_on: string;
          term: Database['public']['Enums']['academic_term'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          is_current?: boolean;
          name: string;
          school_id: string;
          starts_on: string;
          term: Database['public']['Enums']['academic_term'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
          school_id?: string;
          starts_on?: string;
          term?: Database['public']['Enums']['academic_term'];
          updated_at?: string;
        };
        Relationships: [];
      };

      announcements: {
        Row: {
          academic_session_id: string | null;
          audience: Database['public']['Enums']['announcement_audience'];
          author_id: string | null;
          body: string;
          class_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          is_pinned: boolean;
          priority: Database['public']['Enums']['announcement_priority'];
          publish_at: string;
          recipient_id: string | null;
          role_id: string | null;
          school_id: string;
          status: Database['public']['Enums']['publication_status'];
          title: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id?: string | null;
          audience?: Database['public']['Enums']['announcement_audience'];
          author_id?: string | null;
          body: string;
          class_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_pinned?: boolean;
          priority?: Database['public']['Enums']['announcement_priority'];
          publish_at?: string;
          recipient_id?: string | null;
          role_id?: string | null;
          school_id: string;
          status?: Database['public']['Enums']['publication_status'];
          title: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string | null;
          audience?: Database['public']['Enums']['announcement_audience'];
          author_id?: string | null;
          body?: string;
          class_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_pinned?: boolean;
          priority?: Database['public']['Enums']['announcement_priority'];
          publish_at?: string;
          recipient_id?: string | null;
          role_id?: string | null;
          school_id?: string;
          status?: Database['public']['Enums']['publication_status'];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      assignment_submissions: {
        Row: {
          assignment_id: string;
          attempt: number;
          content: string | null;
          created_at: string;
          feedback: string | null;
          graded_at: string | null;
          graded_by: string | null;
          id: string;
          is_late: boolean;
          school_id: string;
          score: number | null;
          status: Database['public']['Enums']['submission_status'];
          student_id: string;
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          assignment_id: string;
          attempt?: number;
          content?: string | null;
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          is_late?: boolean;
          school_id: string;
          score?: number | null;
          status?: Database['public']['Enums']['submission_status'];
          student_id: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string;
          attempt?: number;
          content?: string | null;
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          is_late?: boolean;
          school_id?: string;
          score?: number | null;
          status?: Database['public']['Enums']['submission_status'];
          student_id?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      assignments: {
        Row: {
          academic_session_id: string;
          allow_late: boolean;
          allow_resubmission: boolean;
          assessment_type: Database['public']['Enums']['assessment_type'];
          class_id: string;
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_at: string;
          id: string;
          instructions: string | null;
          late_penalty_percent: number;
          lesson_id: string | null;
          max_attempts: number;
          max_score: number;
          published_at: string | null;
          school_id: string;
          status: Database['public']['Enums']['publication_status'];
          subject_id: string;
          title: string;
          updated_at: string;
          weight: number;
        };
        Insert: {
          academic_session_id: string;
          allow_late?: boolean;
          allow_resubmission?: boolean;
          assessment_type?: Database['public']['Enums']['assessment_type'];
          class_id: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at: string;
          id?: string;
          instructions?: string | null;
          late_penalty_percent?: number;
          lesson_id?: string | null;
          max_attempts?: number;
          max_score?: number;
          published_at?: string | null;
          school_id: string;
          status?: Database['public']['Enums']['publication_status'];
          subject_id: string;
          title: string;
          updated_at?: string;
          weight?: number;
        };
        Update: {
          academic_session_id?: string;
          allow_late?: boolean;
          allow_resubmission?: boolean;
          assessment_type?: Database['public']['Enums']['assessment_type'];
          class_id?: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string;
          id?: string;
          instructions?: string | null;
          late_penalty_percent?: number;
          lesson_id?: string | null;
          max_attempts?: number;
          max_score?: number;
          published_at?: string | null;
          school_id?: string;
          status?: Database['public']['Enums']['publication_status'];
          subject_id?: string;
          title?: string;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [];
      };

      attendance_records: {
        Row: {
          academic_session_id: string;
          class_id: string;
          created_at: string;
          id: string;
          minutes_late: number | null;
          note: string | null;
          recorded_at: string;
          recorded_by: string | null;
          school_id: string;
          status: Database['public']['Enums']['attendance_status'];
          student_id: string;
          subject_id: string | null;
          taken_on: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id: string;
          class_id: string;
          created_at?: string;
          id?: string;
          minutes_late?: number | null;
          note?: string | null;
          recorded_at?: string;
          recorded_by?: string | null;
          school_id: string;
          status?: Database['public']['Enums']['attendance_status'];
          student_id: string;
          subject_id?: string | null;
          taken_on?: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string;
          class_id?: string;
          created_at?: string;
          id?: string;
          minutes_late?: number | null;
          note?: string | null;
          recorded_at?: string;
          recorded_by?: string | null;
          school_id?: string;
          status?: Database['public']['Enums']['attendance_status'];
          student_id?: string;
          subject_id?: string | null;
          taken_on?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      audit_logs: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          changed_columns: string[] | null;
          context: Json;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: string | null;
          school_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          changed_columns?: string[] | null;
          context?: Json;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: string | null;
          school_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          changed_columns?: string[] | null;
          context?: Json;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: string | null;
          school_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };

      class_subjects: {
        Row: {
          academic_session_id: string;
          class_id: string;
          created_at: string;
          id: string;
          is_compulsory: boolean;
          periods_per_week: number;
          school_id: string;
          subject_id: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id: string;
          class_id: string;
          created_at?: string;
          id?: string;
          is_compulsory?: boolean;
          periods_per_week?: number;
          school_id: string;
          subject_id: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string;
          class_id?: string;
          created_at?: string;
          id?: string;
          is_compulsory?: boolean;
          periods_per_week?: number;
          school_id?: string;
          subject_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      classes: {
        Row: {
          academic_session_id: string;
          arm: string;
          capacity: number;
          code: string;
          created_at: string;
          form_teacher_id: string | null;
          id: string;
          is_active: boolean;
          level: number;
          name: string;
          room: string | null;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id: string;
          arm?: string;
          capacity?: number;
          code: string;
          created_at?: string;
          form_teacher_id?: string | null;
          id?: string;
          is_active?: boolean;
          level: number;
          name: string;
          room?: string | null;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string;
          arm?: string;
          capacity?: number;
          code?: string;
          created_at?: string;
          form_teacher_id?: string | null;
          id?: string;
          is_active?: boolean;
          level?: number;
          name?: string;
          room?: string | null;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      enrollments: {
        Row: {
          academic_session_id: string;
          class_id: string;
          completed_on: string | null;
          created_at: string;
          enrolled_on: string;
          id: string;
          roll_number: number | null;
          school_id: string;
          status: Database['public']['Enums']['enrollment_status'];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id: string;
          class_id: string;
          completed_on?: string | null;
          created_at?: string;
          enrolled_on?: string;
          id?: string;
          roll_number?: number | null;
          school_id: string;
          status?: Database['public']['Enums']['enrollment_status'];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string;
          class_id?: string;
          completed_on?: string | null;
          created_at?: string;
          enrolled_on?: string;
          id?: string;
          roll_number?: number | null;
          school_id?: string;
          status?: Database['public']['Enums']['enrollment_status'];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      files: {
        Row: {
          bucket: Database['public']['Enums']['storage_bucket'];
          checksum: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          mime_type: string;
          original_name: string;
          owner_id: string | null;
          path: string;
          school_id: string;
          size_bytes: number;
          updated_at: string;
          visibility: Database['public']['Enums']['file_visibility'];
        };
        Insert: {
          bucket: Database['public']['Enums']['storage_bucket'];
          checksum?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          mime_type?: string;
          original_name: string;
          owner_id?: string | null;
          path: string;
          school_id: string;
          size_bytes: number;
          updated_at?: string;
          visibility?: Database['public']['Enums']['file_visibility'];
        };
        Update: {
          bucket?: Database['public']['Enums']['storage_bucket'];
          checksum?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          mime_type?: string;
          original_name?: string;
          owner_id?: string | null;
          path?: string;
          school_id?: string;
          size_bytes?: number;
          updated_at?: string;
          visibility?: Database['public']['Enums']['file_visibility'];
        };
        Relationships: [];
      };

      grades: {
        Row: {
          academic_session_id: string;
          assessment_type: Database['public']['Enums']['assessment_type'];
          class_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          is_published: boolean;
          letter_grade: string | null;
          max_score: number;
          /** Generated column: round(score / max_score * 100, 2). */
          percentage: number;
          recorded_at: string;
          recorded_by: string | null;
          remark: string | null;
          school_id: string;
          score: number;
          source_id: string | null;
          source_type: Database['public']['Enums']['grade_source'];
          student_id: string;
          subject_id: string;
          title: string;
          updated_at: string;
          weight: number;
        };
        Insert: {
          academic_session_id: string;
          assessment_type?: Database['public']['Enums']['assessment_type'];
          class_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          letter_grade?: string | null;
          max_score: number;
          recorded_at?: string;
          recorded_by?: string | null;
          remark?: string | null;
          school_id: string;
          score: number;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['grade_source'];
          student_id: string;
          subject_id: string;
          title: string;
          updated_at?: string;
          weight?: number;
        };
        Update: {
          academic_session_id?: string;
          assessment_type?: Database['public']['Enums']['assessment_type'];
          class_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          letter_grade?: string | null;
          max_score?: number;
          recorded_at?: string;
          recorded_by?: string | null;
          remark?: string | null;
          school_id?: string;
          score?: number;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['grade_source'];
          student_id?: string;
          subject_id?: string;
          title?: string;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [];
      };

      lessons: {
        Row: {
          academic_session_id: string;
          class_id: string;
          content: string | null;
          content_type: Database['public']['Enums']['lesson_content_type'];
          created_at: string;
          created_by: string | null;
          duration_minutes: number | null;
          external_url: string | null;
          id: string;
          sort_order: number;
          published_at: string | null;
          school_id: string;
          status: Database['public']['Enums']['publication_status'];
          subject_id: string;
          summary: string | null;
          title: string;
          updated_at: string;
          week_number: number | null;
        };
        Insert: {
          academic_session_id: string;
          class_id: string;
          content?: string | null;
          content_type?: Database['public']['Enums']['lesson_content_type'];
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number | null;
          external_url?: string | null;
          id?: string;
          sort_order?: number;
          published_at?: string | null;
          school_id: string;
          status?: Database['public']['Enums']['publication_status'];
          subject_id: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          week_number?: number | null;
        };
        Update: {
          academic_session_id?: string;
          class_id?: string;
          content?: string | null;
          content_type?: Database['public']['Enums']['lesson_content_type'];
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number | null;
          external_url?: string | null;
          id?: string;
          sort_order?: number;
          published_at?: string | null;
          school_id?: string;
          status?: Database['public']['Enums']['publication_status'];
          subject_id?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          week_number?: number | null;
        };
        Relationships: [];
      };

      notifications: {
        Row: {
          action_url: string | null;
          actor_id: string | null;
          body: string | null;
          created_at: string;
          delivered: Json;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          is_read: boolean;
          read_at: string | null;
          school_id: string;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          user_id: string;
        };
        Insert: {
          action_url?: string | null;
          actor_id?: string | null;
          body?: string | null;
          created_at?: string;
          delivered?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          is_read?: boolean;
          read_at?: string | null;
          school_id: string;
          title: string;
          type?: Database['public']['Enums']['notification_type'];
          user_id: string;
        };
        Update: {
          action_url?: string | null;
          actor_id?: string | null;
          body?: string | null;
          created_at?: string;
          delivered?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          is_read?: boolean;
          read_at?: string | null;
          school_id?: string;
          title?: string;
          type?: Database['public']['Enums']['notification_type'];
          user_id?: string;
        };
        Relationships: [];
      };

      parent_students: {
        Row: {
          can_pick_up: boolean;
          created_at: string;
          id: string;
          is_primary_contact: boolean;
          parent_id: string;
          relationship: Database['public']['Enums']['guardian_relationship'];
          school_id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          can_pick_up?: boolean;
          created_at?: string;
          id?: string;
          is_primary_contact?: boolean;
          parent_id: string;
          relationship?: Database['public']['Enums']['guardian_relationship'];
          school_id: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          can_pick_up?: boolean;
          created_at?: string;
          id?: string;
          is_primary_contact?: boolean;
          parent_id?: string;
          relationship?: Database['public']['Enums']['guardian_relationship'];
          school_id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      parents: {
        Row: {
          address: string | null;
          created_at: string;
          employer: string | null;
          id: string;
          is_active: boolean;
          occupation: string | null;
          school_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          employer?: string | null;
          id?: string;
          is_active?: boolean;
          occupation?: string | null;
          school_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          employer?: string | null;
          id?: string;
          is_active?: boolean;
          occupation?: string | null;
          school_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };

      quiz_attempts: {
        Row: {
          attempt_number: number;
          created_at: string;
          expires_at: string | null;
          graded_at: string | null;
          id: string;
          max_score: number | null;
          /** Generated column: round(score / max_score * 100, 2). */
          percentage: number | null;
          quiz_id: string;
          responses: Json;
          school_id: string;
          score: number | null;
          started_at: string;
          status: Database['public']['Enums']['attempt_status'];
          student_id: string;
          submitted_at: string | null;
          time_spent_seconds: number | null;
          updated_at: string;
        };
        Insert: {
          attempt_number?: number;
          created_at?: string;
          expires_at?: string | null;
          graded_at?: string | null;
          id?: string;
          max_score?: number | null;
          quiz_id: string;
          responses?: Json;
          school_id: string;
          score?: number | null;
          started_at?: string;
          status?: Database['public']['Enums']['attempt_status'];
          student_id: string;
          submitted_at?: string | null;
          time_spent_seconds?: number | null;
          updated_at?: string;
        };
        Update: {
          attempt_number?: number;
          created_at?: string;
          expires_at?: string | null;
          graded_at?: string | null;
          id?: string;
          max_score?: number | null;
          quiz_id?: string;
          responses?: Json;
          school_id?: string;
          score?: number | null;
          started_at?: string;
          status?: Database['public']['Enums']['attempt_status'];
          student_id?: string;
          submitted_at?: string | null;
          time_spent_seconds?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      quiz_questions: {
        Row: {
          correct_answers: Json | null;
          created_at: string;
          explanation: string | null;
          id: string;
          media_path: string | null;
          options: Json | null;
          points: number;
          sort_order: number;
          prompt: string;
          question_type: Database['public']['Enums']['question_type'];
          quiz_id: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          correct_answers?: Json | null;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          media_path?: string | null;
          options?: Json | null;
          points?: number;
          sort_order: number;
          prompt: string;
          question_type?: Database['public']['Enums']['question_type'];
          quiz_id: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          correct_answers?: Json | null;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          media_path?: string | null;
          options?: Json | null;
          points?: number;
          sort_order?: number;
          prompt?: string;
          question_type?: Database['public']['Enums']['question_type'];
          quiz_id?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      quizzes: {
        Row: {
          academic_session_id: string;
          assessment_type: Database['public']['Enums']['assessment_type'];
          class_id: string;
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_minutes: number;
          id: string;
          instructions: string | null;
          lesson_id: string | null;
          max_attempts: number;
          opens_at: string | null;
          passing_percentage: number;
          published_at: string | null;
          school_id: string;
          show_results_immediately: boolean;
          shuffle_options: boolean;
          shuffle_questions: boolean;
          status: Database['public']['Enums']['publication_status'];
          subject_id: string;
          title: string;
          total_points: number;
          updated_at: string;
          weight: number;
        };
        Insert: {
          academic_session_id: string;
          assessment_type?: Database['public']['Enums']['assessment_type'];
          class_id: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          instructions?: string | null;
          lesson_id?: string | null;
          max_attempts?: number;
          opens_at?: string | null;
          passing_percentage?: number;
          published_at?: string | null;
          school_id: string;
          show_results_immediately?: boolean;
          shuffle_options?: boolean;
          shuffle_questions?: boolean;
          status?: Database['public']['Enums']['publication_status'];
          subject_id: string;
          title: string;
          total_points?: number;
          updated_at?: string;
          weight?: number;
        };
        Update: {
          academic_session_id?: string;
          assessment_type?: Database['public']['Enums']['assessment_type'];
          class_id?: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          instructions?: string | null;
          lesson_id?: string | null;
          max_attempts?: number;
          opens_at?: string | null;
          passing_percentage?: number;
          published_at?: string | null;
          school_id?: string;
          show_results_immediately?: boolean;
          shuffle_options?: boolean;
          shuffle_questions?: boolean;
          status?: Database['public']['Enums']['publication_status'];
          subject_id?: string;
          title?: string;
          total_points?: number;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [];
      };

      roles: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_system: boolean;
          name: string;
          permissions: Json;
          rank: number;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          permissions?: Json;
          rank?: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          permissions?: Json;
          rank?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      schools: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          country: string;
          created_at: string;
          email: string | null;
          grading_scale: Json;
          id: string;
          is_active: boolean;
          locale: string;
          logo_path: string | null;
          motto: string | null;
          name: string;
          phone: string | null;
          postal_code: string | null;
          settings: Json;
          slug: string;
          state: string | null;
          timezone: string;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          email?: string | null;
          grading_scale?: Json;
          id?: string;
          is_active?: boolean;
          locale?: string;
          logo_path?: string | null;
          motto?: string | null;
          name: string;
          phone?: string | null;
          postal_code?: string | null;
          settings?: Json;
          slug: string;
          state?: string | null;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          email?: string | null;
          grading_scale?: Json;
          id?: string;
          is_active?: boolean;
          locale?: string;
          logo_path?: string | null;
          motto?: string | null;
          name?: string;
          phone?: string | null;
          postal_code?: string | null;
          settings?: Json;
          slug?: string;
          state?: string | null;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };

      students: {
        Row: {
          address: string | null;
          admission_date: string;
          admission_number: string;
          blood_group: string | null;
          created_at: string;
          current_class_id: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          id: string;
          medical_notes: string | null;
          school_id: string;
          status: Database['public']['Enums']['student_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          admission_date?: string;
          admission_number: string;
          blood_group?: string | null;
          created_at?: string;
          current_class_id?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          id?: string;
          medical_notes?: string | null;
          school_id: string;
          status?: Database['public']['Enums']['student_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          admission_date?: string;
          admission_number?: string;
          blood_group?: string | null;
          created_at?: string;
          current_class_id?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          id?: string;
          medical_notes?: string | null;
          school_id?: string;
          status?: Database['public']['Enums']['student_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };

      subjects: {
        Row: {
          code: string;
          color: string;
          created_at: string;
          department: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          is_core: boolean;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          color?: string;
          created_at?: string;
          department?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_core?: boolean;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          color?: string;
          created_at?: string;
          department?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_core?: boolean;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      teacher_assignments: {
        Row: {
          academic_session_id: string;
          assigned_on: string;
          class_id: string;
          created_at: string;
          id: string;
          is_lead: boolean;
          school_id: string;
          subject_id: string;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id: string;
          assigned_on?: string;
          class_id: string;
          created_at?: string;
          id?: string;
          is_lead?: boolean;
          school_id: string;
          subject_id: string;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string;
          assigned_on?: string;
          class_id?: string;
          created_at?: string;
          id?: string;
          is_lead?: boolean;
          school_id?: string;
          subject_id?: string;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      teachers: {
        Row: {
          bio: string | null;
          created_at: string;
          employment_type: Database['public']['Enums']['employment_type'];
          hire_date: string | null;
          id: string;
          is_active: boolean;
          qualification: string | null;
          school_id: string;
          specialization: string | null;
          staff_number: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          employment_type?: Database['public']['Enums']['employment_type'];
          hire_date?: string | null;
          id?: string;
          is_active?: boolean;
          qualification?: string | null;
          school_id: string;
          specialization?: string | null;
          staff_number: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          employment_type?: Database['public']['Enums']['employment_type'];
          hire_date?: string | null;
          id?: string;
          is_active?: boolean;
          qualification?: string | null;
          school_id?: string;
          specialization?: string | null;
          staff_number?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };

      timetable_slots: {
        Row: {
          academic_session_id: string;
          class_id: string;
          created_at: string;
          day_of_week: number;
          ends_at: string;
          id: string;
          is_break: boolean;
          label: string | null;
          /** Generated int4range of minutes-from-midnight; backs the clash constraints. */
          period: unknown;
          room: string | null;
          school_id: string;
          starts_at: string;
          subject_id: string;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          academic_session_id: string;
          class_id: string;
          created_at?: string;
          day_of_week: number;
          ends_at: string;
          id?: string;
          is_break?: boolean;
          label?: string | null;
          room?: string | null;
          school_id: string;
          starts_at: string;
          subject_id: string;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string;
          class_id?: string;
          created_at?: string;
          day_of_week?: number;
          ends_at?: string;
          id?: string;
          is_break?: boolean;
          label?: string | null;
          room?: string | null;
          school_id?: string;
          starts_at?: string;
          subject_id?: string;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      user_roles: {
        Row: {
          created_at: string;
          expires_at: string | null;
          granted_at: string;
          granted_by: string | null;
          id: string;
          role_id: string;
          school_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role_id: string;
          school_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role_id?: string;
          school_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };

      users: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          date_of_birth: string | null;
          email: string;
          first_name: string;
          full_name: string;
          gender: Database['public']['Enums']['gender'] | null;
          id: string;
          last_name: string;
          last_seen_at: string | null;
          locale: string;
          metadata: Json;
          middle_name: string | null;
          notification_preferences: Json;
          phone: string | null;
          school_id: string | null;
          status: Database['public']['Enums']['user_status'];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email: string;
          first_name: string;
          full_name?: string;
          gender?: Database['public']['Enums']['gender'] | null;
          id: string;
          last_name: string;
          last_seen_at?: string | null;
          locale?: string;
          metadata?: Json;
          middle_name?: string | null;
          notification_preferences?: Json;
          phone?: string | null;
          school_id?: string | null;
          status?: Database['public']['Enums']['user_status'];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string;
          first_name?: string;
          full_name?: string;
          gender?: Database['public']['Enums']['gender'] | null;
          id?: string;
          last_name?: string;
          last_seen_at?: string | null;
          locale?: string;
          metadata?: Json;
          middle_name?: string | null;
          notification_preferences?: Json;
          phone?: string | null;
          school_id?: string | null;
          status?: Database['public']['Enums']['user_status'];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      current_user_context: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_quiz_paper: {
        Args: { p_quiz_id: string };
        Returns: {
          id: string;
          sort_order: number;
          question_type: Database['public']['Enums']['question_type'];
          prompt: string;
          options: Json | null;
          points: number;
          media_path: string | null;
        }[];
      };
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      search_students: {
        Args: {
          p_query?: string | undefined;
          p_class_id?: string | undefined;
          p_status?: Database['public']['Enums']['student_status'] | undefined;
          p_limit?: number | undefined;
          p_offset?: number | undefined;
        };
        Returns: {
          id: string;
          admission_number: string;
          admission_date: string;
          status: Database['public']['Enums']['student_status'];
          current_class_id: string | null;
          user_id: string;
          full_name: string;
          email: string;
          avatar_path: string | null;
          phone: string | null;
          class_name: string | null;
          class_arm: string | null;
          total_count: number;
        }[];
      };
      start_quiz_attempt: {
        Args: { p_quiz_id: string };
        Returns: Database['public']['Tables']['quiz_attempts']['Row'];
      };
      submit_quiz_attempt: {
        Args: { p_attempt_id: string; p_responses: Json };
        Returns: Database['public']['Tables']['quiz_attempts']['Row'];
      };
    };

    Enums: {
      academic_term: 'first' | 'second' | 'third';
      announcement_audience: 'school' | 'class' | 'role' | 'individual';
      announcement_priority: 'normal' | 'important' | 'urgent';
      assessment_type:
        | 'homework'
        | 'classwork'
        | 'assignment'
        | 'test'
        | 'quiz'
        | 'project'
        | 'exam';
      attempt_status: 'in_progress' | 'submitted' | 'graded' | 'abandoned' | 'expired';
      attendance_status: 'present' | 'absent' | 'late' | 'excused';
      audit_action:
        | 'insert'
        | 'update'
        | 'delete'
        | 'login'
        | 'logout'
        | 'export'
        | 'permission_change';
      employment_type: 'full_time' | 'part_time' | 'contract' | 'visiting';
      enrollment_status: 'active' | 'completed' | 'transferred' | 'withdrawn' | 'repeating';
      file_visibility: 'private' | 'class' | 'school' | 'public';
      gender: 'male' | 'female' | 'other' | 'undisclosed';
      grade_source: 'assignment' | 'quiz' | 'manual' | 'exam';
      guardian_relationship: 'father' | 'mother' | 'guardian' | 'sibling' | 'other';
      lesson_content_type: 'video' | 'document' | 'note' | 'link' | 'embed' | 'slide';
      notification_type:
        | 'assignment_published'
        | 'assignment_due_soon'
        | 'submission_graded'
        | 'quiz_published'
        | 'quiz_reminder'
        | 'quiz_graded'
        | 'grade_posted'
        | 'announcement'
        | 'attendance_flagged'
        | 'timetable_changed'
        | 'account'
        | 'system';
      publication_status: 'draft' | 'published' | 'closed' | 'archived';
      question_type:
        | 'multiple_choice'
        | 'multiple_select'
        | 'true_false'
        | 'short_answer'
        | 'essay';
      storage_bucket:
        | 'profile-photos'
        | 'assignment-uploads'
        | 'lesson-materials'
        | 'school-logos'
        | 'student-documents';
      student_status: 'active' | 'graduated' | 'transferred' | 'withdrawn' | 'suspended';
      submission_status:
        | 'draft'
        | 'submitted'
        | 'late'
        | 'graded'
        | 'returned'
        | 'resubmitted'
        | 'missing';
      user_status: 'invited' | 'active' | 'suspended' | 'archived';
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  Convenience helpers — the same ones the Supabase CLI emits.
// ─────────────────────────────────────────────────────────────────────────────

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];

export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type DbFunctions = PublicSchema['Functions'];

export type FunctionArgs<T extends keyof DbFunctions> = DbFunctions[T]['Args'];

export type FunctionReturns<T extends keyof DbFunctions> = DbFunctions[T]['Returns'];

export type TableName = keyof PublicSchema['Tables'];
