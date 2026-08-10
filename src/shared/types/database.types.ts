export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      academic_sessions: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          starts_on: string
          term: Database["public"]["Enums"]["academic_term"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          starts_on: string
          term: Database["public"]["Enums"]["academic_term"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          starts_on?: string
          term?: Database["public"]["Enums"]["academic_term"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          academic_session_id: string | null
          audience: Database["public"]["Enums"]["announcement_audience"]
          author_id: string | null
          body: string
          class_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_pinned: boolean
          priority: Database["public"]["Enums"]["announcement_priority"]
          publish_at: string
          recipient_id: string | null
          role_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["publication_status"]
          title: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string | null
          body: string
          class_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          priority?: Database["public"]["Enums"]["announcement_priority"]
          publish_at?: string
          recipient_id?: string | null
          role_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["publication_status"]
          title: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string | null
          body?: string
          class_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          priority?: Database["public"]["Enums"]["announcement_priority"]
          publish_at?: string
          recipient_id?: string | null
          role_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["publication_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          attempt: number
          content: string | null
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_late: boolean
          school_id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          attempt?: number
          content?: string | null
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean
          school_id: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          attempt?: number
          content?: string | null
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean
          school_id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          academic_session_id: string
          allow_late: boolean
          allow_resubmission: boolean
          assessment_type: Database["public"]["Enums"]["assessment_type"]
          class_id: string
          closes_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string
          id: string
          instructions: string | null
          late_penalty_percent: number
          lesson_id: string | null
          max_attempts: number
          max_score: number
          published_at: string | null
          rubric: Json | null
          school_id: string
          status: Database["public"]["Enums"]["publication_status"]
          subject_id: string
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          academic_session_id: string
          allow_late?: boolean
          allow_resubmission?: boolean
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          class_id: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at: string
          id?: string
          instructions?: string | null
          late_penalty_percent?: number
          lesson_id?: string | null
          max_attempts?: number
          max_score?: number
          published_at?: string | null
          rubric?: Json | null
          school_id: string
          status?: Database["public"]["Enums"]["publication_status"]
          subject_id: string
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          academic_session_id?: string
          allow_late?: boolean
          allow_resubmission?: boolean
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          class_id?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string
          id?: string
          instructions?: string | null
          late_penalty_percent?: number
          lesson_id?: string | null
          max_attempts?: number
          max_score?: number
          published_at?: string | null
          rubric?: Json | null
          school_id?: string
          status?: Database["public"]["Enums"]["publication_status"]
          subject_id?: string
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignments_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          after: Json | null
          before: Json | null
          changed_columns: string[] | null
          context: Json
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          school_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          changed_columns?: string[] | null
          context?: Json
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          school_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          changed_columns?: string[] | null
          context?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          school_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          academic_session_id: string
          class_id: string
          created_at: string
          id: string
          is_compulsory: boolean
          periods_per_week: number
          school_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          class_id: string
          created_at?: string
          id?: string
          is_compulsory?: boolean
          periods_per_week?: number
          school_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          class_id?: string
          created_at?: string
          id?: string
          is_compulsory?: boolean
          periods_per_week?: number
          school_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_session_id: string
          arm: string
          capacity: number
          code: string
          created_at: string
          form_teacher_id: string | null
          id: string
          is_active: boolean
          level: number
          name: string
          room: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          arm?: string
          capacity?: number
          code: string
          created_at?: string
          form_teacher_id?: string | null
          id?: string
          is_active?: boolean
          level: number
          name: string
          room?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          arm?: string
          capacity?: number
          code?: string
          created_at?: string
          form_teacher_id?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name?: string
          room?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_form_teacher_id_fkey"
            columns: ["form_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          school_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          school_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          school_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_session_id: string
          class_id: string
          completed_on: string | null
          created_at: string
          enrolled_on: string
          id: string
          roll_number: number | null
          school_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          class_id: string
          completed_on?: string | null
          created_at?: string
          enrolled_on?: string
          id?: string
          roll_number?: number | null
          school_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          class_id?: string
          completed_on?: string | null
          created_at?: string
          enrolled_on?: string
          id?: string
          roll_number?: number | null
          school_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          bucket: Database["public"]["Enums"]["storage_bucket"]
          checksum: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          mime_type: string
          original_name: string
          owner_id: string | null
          path: string
          school_id: string
          size_bytes: number
          updated_at: string
          visibility: Database["public"]["Enums"]["file_visibility"]
        }
        Insert: {
          bucket: Database["public"]["Enums"]["storage_bucket"]
          checksum?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          mime_type?: string
          original_name: string
          owner_id?: string | null
          path: string
          school_id: string
          size_bytes: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
        }
        Update: {
          bucket?: Database["public"]["Enums"]["storage_bucket"]
          checksum?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          mime_type?: string
          original_name?: string
          owner_id?: string | null
          path?: string
          school_id?: string
          size_bytes?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          academic_session_id: string
          assessment_type: Database["public"]["Enums"]["assessment_type"]
          class_id: string
          comment: string | null
          created_at: string
          id: string
          is_published: boolean
          letter_grade: string | null
          max_score: number
          percentage: number | null
          recorded_at: string
          recorded_by: string | null
          remark: string | null
          school_id: string
          score: number
          source_id: string | null
          source_type: Database["public"]["Enums"]["grade_source"]
          student_id: string
          subject_id: string
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          academic_session_id: string
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          class_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          letter_grade?: string | null
          max_score: number
          percentage?: number | null
          recorded_at?: string
          recorded_by?: string | null
          remark?: string | null
          school_id: string
          score: number
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["grade_source"]
          student_id: string
          subject_id: string
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          academic_session_id?: string
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          class_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          letter_grade?: string | null
          max_score?: number
          percentage?: number | null
          recorded_at?: string
          recorded_by?: string | null
          remark?: string | null
          school_id?: string
          score?: number
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["grade_source"]
          student_id?: string
          subject_id?: string
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grades_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          academic_session_id: string
          available_from: string | null
          class_id: string
          content: string | null
          content_type: Database["public"]["Enums"]["lesson_content_type"]
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          external_url: string | null
          id: string
          objectives: string[] | null
          published_at: string | null
          school_id: string
          sort_order: number
          status: Database["public"]["Enums"]["publication_status"]
          subject_id: string
          summary: string | null
          title: string
          updated_at: string
          week_number: number | null
        }
        Insert: {
          academic_session_id: string
          available_from?: string | null
          class_id: string
          content?: string | null
          content_type?: Database["public"]["Enums"]["lesson_content_type"]
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          external_url?: string | null
          id?: string
          objectives?: string[] | null
          published_at?: string | null
          school_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["publication_status"]
          subject_id: string
          summary?: string | null
          title: string
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          academic_session_id?: string
          available_from?: string | null
          class_id?: string
          content?: string | null
          content_type?: Database["public"]["Enums"]["lesson_content_type"]
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          external_url?: string | null
          id?: string
          objectives?: string[] | null
          published_at?: string | null
          school_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["publication_status"]
          subject_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          school_id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          school_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          school_id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          actor_id: string | null
          body: string | null
          created_at: string
          delivered: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          read_at: string | null
          school_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          actor_id?: string | null
          body?: string | null
          created_at?: string
          delivered?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          school_id: string
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          actor_id?: string | null
          body?: string | null
          created_at?: string
          delivered?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          school_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_students: {
        Row: {
          can_pick_up: boolean
          created_at: string
          id: string
          is_primary_contact: boolean
          parent_id: string
          relationship: Database["public"]["Enums"]["guardian_relationship"]
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          can_pick_up?: boolean
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          parent_id: string
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          can_pick_up?: boolean
          created_at?: string
          id?: string
          is_primary_contact?: boolean
          parent_id?: string
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          address: string | null
          created_at: string
          employer: string | null
          id: string
          is_active: boolean
          occupation: string | null
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          employer?: string | null
          id?: string
          is_active?: boolean
          occupation?: string | null
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          employer?: string | null
          id?: string
          is_active?: boolean
          occupation?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_items: {
        Row: {
          correct_answers: Json | null
          created_at: string
          created_by: string | null
          explanation: string | null
          id: string
          level: number | null
          options: Json | null
          points: number
          prompt: string
          question_type: Database["public"]["Enums"]["question_type"]
          school_id: string
          subject_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          correct_answers?: Json | null
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          level?: number | null
          options?: Json | null
          points?: number
          prompt: string
          question_type?: Database["public"]["Enums"]["question_type"]
          school_id: string
          subject_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          correct_answers?: Json | null
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          level?: number | null
          options?: Json | null
          points?: number
          prompt?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          school_id?: string
          subject_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          expires_at: string | null
          graded_at: string | null
          id: string
          max_score: number | null
          percentage: number | null
          quiz_id: string
          responses: Json
          school_id: string
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at: string | null
          time_spent_seconds: number | null
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          expires_at?: string | null
          graded_at?: string | null
          id?: string
          max_score?: number | null
          percentage?: number | null
          quiz_id: string
          responses?: Json
          school_id: string
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          expires_at?: string | null
          graded_at?: string | null
          id?: string
          max_score?: number | null
          percentage?: number | null
          quiz_id?: string
          responses?: Json
          school_id?: string
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id?: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answers: Json | null
          created_at: string
          explanation: string | null
          id: string
          media_path: string | null
          options: Json | null
          points: number
          prompt: string
          question_type: Database["public"]["Enums"]["question_type"]
          quiz_id: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          correct_answers?: Json | null
          created_at?: string
          explanation?: string | null
          id?: string
          media_path?: string | null
          options?: Json | null
          points?: number
          prompt: string
          question_type?: Database["public"]["Enums"]["question_type"]
          quiz_id: string
          school_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          correct_answers?: Json | null
          created_at?: string
          explanation?: string | null
          id?: string
          media_path?: string | null
          options?: Json | null
          points?: number
          prompt?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          quiz_id?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          academic_session_id: string
          assessment_type: Database["public"]["Enums"]["assessment_type"]
          class_id: string
          closes_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          instructions: string | null
          lesson_id: string | null
          max_attempts: number
          opens_at: string | null
          passing_percentage: number
          published_at: string | null
          school_id: string
          show_results_immediately: boolean
          shuffle_options: boolean
          shuffle_questions: boolean
          status: Database["public"]["Enums"]["publication_status"]
          subject_id: string
          title: string
          total_points: number
          updated_at: string
          weight: number
        }
        Insert: {
          academic_session_id: string
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          class_id: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          max_attempts?: number
          opens_at?: string | null
          passing_percentage?: number
          published_at?: string | null
          school_id: string
          show_results_immediately?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["publication_status"]
          subject_id: string
          title: string
          total_points?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          academic_session_id?: string
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          class_id?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          max_attempts?: number
          opens_at?: string | null
          passing_percentage?: number
          published_at?: string | null
          school_id?: string
          show_results_immediately?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["publication_status"]
          subject_id?: string
          title?: string
          total_points?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          permissions: Json
          rank: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          permissions?: Json
          rank?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Json
          rank?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string
          created_at: string
          email: string | null
          grading_scale: Json
          id: string
          is_active: boolean
          locale: string
          logo_path: string | null
          motto: string | null
          name: string
          phone: string | null
          postal_code: string | null
          settings: Json
          slug: string
          state: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          grading_scale?: Json
          id?: string
          is_active?: boolean
          locale?: string
          logo_path?: string | null
          motto?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          settings?: Json
          slug: string
          state?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          grading_scale?: Json
          id?: string
          is_active?: boolean
          locale?: string
          logo_path?: string | null
          motto?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          settings?: Json
          slug?: string
          state?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      student_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          is_private: boolean
          school_id: string
          student_id: string
          subject_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_private?: boolean
          school_id: string
          student_id: string
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_private?: boolean
          school_id?: string
          student_id?: string
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admission_date: string
          admission_number: string
          blood_group: string | null
          created_at: string
          current_class_id: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          medical_notes: string | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          admission_date?: string
          admission_number: string
          blood_group?: string | null
          created_at?: string
          current_class_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          medical_notes?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          admission_date?: string
          admission_number?: string
          blood_group?: string | null
          created_at?: string
          current_class_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          medical_notes?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_current_class_id_fkey"
            columns: ["current_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          color: string
          created_at: string
          department: string | null
          description: string | null
          id: string
          is_active: boolean
          is_core: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_core?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_core?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          academic_session_id: string
          assigned_on: string
          class_id: string
          created_at: string
          id: string
          is_lead: boolean
          school_id: string
          subject_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          assigned_on?: string
          class_id: string
          created_at?: string
          id?: string
          is_lead?: boolean
          school_id: string
          subject_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          assigned_on?: string
          class_id?: string
          created_at?: string
          id?: string
          is_lead?: boolean
          school_id?: string
          subject_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          bio: string | null
          created_at: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          hire_date: string | null
          id: string
          is_active: boolean
          qualification: string | null
          school_id: string
          specialization: string | null
          staff_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date?: string | null
          id?: string
          is_active?: boolean
          qualification?: string | null
          school_id: string
          specialization?: string | null
          staff_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date?: string | null
          id?: string
          is_active?: boolean
          qualification?: string | null
          school_id?: string
          specialization?: string | null
          staff_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          academic_session_id: string
          class_id: string
          created_at: string
          day_of_week: number
          ends_at: string
          id: string
          is_break: boolean
          label: string | null
          period: unknown
          room: string | null
          school_id: string
          starts_at: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          class_id: string
          created_at?: string
          day_of_week: number
          ends_at: string
          id?: string
          is_break?: boolean
          label?: string | null
          period?: unknown
          room?: string | null
          school_id: string
          starts_at: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          class_id?: string
          created_at?: string
          day_of_week?: number
          ends_at?: string
          id?: string
          is_break?: boolean
          label?: string | null
          period?: unknown
          room?: string | null
          school_id?: string
          starts_at?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          role_id: string
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id: string
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id?: string
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_path: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          first_name: string
          full_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          last_name: string
          last_seen_at: string | null
          locale: string
          metadata: Json
          middle_name: string | null
          notification_preferences: Json
          phone: string | null
          school_id: string | null
          status: Database["public"]["Enums"]["user_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id: string
          last_name: string
          last_seen_at?: string | null
          locale?: string
          metadata?: Json
          middle_name?: string | null
          notification_preferences?: Json
          phone?: string | null
          school_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          last_name?: string
          last_seen_at?: string | null
          locale?: string
          metadata?: Json
          middle_name?: string | null
          notification_preferences?: Json
          phone?: string | null
          school_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_context: { Args: never; Returns: Json }
      get_quiz_paper: {
        Args: { p_quiz_id: string }
        Returns: {
          id: string
          match_pool: Json
          media_path: string
          options: Json
          points: number
          prompt: string
          question_type: Database["public"]["Enums"]["question_type"]
          sort_order: number
        }[]
      }
      global_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          id: string
          kind: string
          subtitle: string
          title: string
        }[]
      }
      list_correspondents: {
        Args: never
        Returns: {
          avatar_path: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      provision_user_role: {
        Args: { p_role: string; p_school_id: string; p_user_id: string }
        Returns: undefined
      }
      search_students: {
        Args: {
          p_class_id?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: Database["public"]["Enums"]["student_status"]
        }
        Returns: {
          admission_date: string
          admission_number: string
          avatar_path: string
          class_arm: string
          class_name: string
          current_class_id: string
          email: string
          full_name: string
          id: string
          phone: string
          status: Database["public"]["Enums"]["student_status"]
          total_count: number
          user_id: string
          user_status: Database["public"]["Enums"]["user_status"]
        }[]
      }
      start_quiz_attempt: {
        Args: { p_quiz_id: string }
        Returns: {
          attempt_number: number
          created_at: string
          expires_at: string | null
          graded_at: string | null
          id: string
          max_score: number | null
          percentage: number | null
          quiz_id: string
          responses: Json
          school_id: string
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at: string | null
          time_spent_seconds: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "quiz_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_quiz_attempt: {
        Args: { p_attempt_id: string; p_responses: Json }
        Returns: {
          attempt_number: number
          created_at: string
          expires_at: string | null
          graded_at: string | null
          id: string
          max_score: number | null
          percentage: number | null
          quiz_id: string
          responses: Json
          school_id: string
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at: string | null
          time_spent_seconds: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "quiz_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      academic_term: "first" | "second" | "third"
      announcement_audience: "school" | "class" | "role" | "individual"
      announcement_priority: "normal" | "important" | "urgent"
      assessment_type:
        | "homework"
        | "classwork"
        | "assignment"
        | "test"
        | "quiz"
        | "project"
        | "exam"
      attempt_status:
        | "in_progress"
        | "submitted"
        | "graded"
        | "abandoned"
        | "expired"
      audit_action:
        | "insert"
        | "update"
        | "delete"
        | "login"
        | "logout"
        | "export"
        | "permission_change"
      employment_type: "full_time" | "part_time" | "contract" | "visiting"
      enrollment_status:
        | "active"
        | "completed"
        | "transferred"
        | "withdrawn"
        | "repeating"
      file_visibility: "private" | "class" | "school" | "public"
      gender: "male" | "female" | "other" | "undisclosed"
      grade_source: "assignment" | "quiz" | "manual" | "exam"
      guardian_relationship:
        | "father"
        | "mother"
        | "guardian"
        | "sibling"
        | "other"
      lesson_content_type:
        | "video"
        | "document"
        | "note"
        | "link"
        | "embed"
        | "slide"
      notification_type:
        | "assignment_published"
        | "assignment_due_soon"
        | "submission_graded"
        | "quiz_published"
        | "quiz_reminder"
        | "quiz_graded"
        | "grade_posted"
        | "announcement"
        | "timetable_changed"
        | "account"
        | "system"
      publication_status: "draft" | "published" | "closed" | "archived"
      question_type:
        | "multiple_choice"
        | "multiple_select"
        | "true_false"
        | "short_answer"
        | "essay"
        | "fill_blank"
        | "matching"
      storage_bucket:
        | "profile-photos"
        | "assignment-uploads"
        | "lesson-materials"
        | "school-logos"
        | "student-documents"
        | "message-attachments"
      student_status:
        | "active"
        | "graduated"
        | "transferred"
        | "withdrawn"
        | "suspended"
      submission_status:
        | "draft"
        | "submitted"
        | "late"
        | "graded"
        | "returned"
        | "resubmitted"
        | "missing"
      user_status: "invited" | "active" | "suspended" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      academic_term: ["first", "second", "third"],
      announcement_audience: ["school", "class", "role", "individual"],
      announcement_priority: ["normal", "important", "urgent"],
      assessment_type: [
        "homework",
        "classwork",
        "assignment",
        "test",
        "quiz",
        "project",
        "exam",
      ],
      attempt_status: [
        "in_progress",
        "submitted",
        "graded",
        "abandoned",
        "expired",
      ],
      audit_action: [
        "insert",
        "update",
        "delete",
        "login",
        "logout",
        "export",
        "permission_change",
      ],
      employment_type: ["full_time", "part_time", "contract", "visiting"],
      enrollment_status: [
        "active",
        "completed",
        "transferred",
        "withdrawn",
        "repeating",
      ],
      file_visibility: ["private", "class", "school", "public"],
      gender: ["male", "female", "other", "undisclosed"],
      grade_source: ["assignment", "quiz", "manual", "exam"],
      guardian_relationship: [
        "father",
        "mother",
        "guardian",
        "sibling",
        "other",
      ],
      lesson_content_type: [
        "video",
        "document",
        "note",
        "link",
        "embed",
        "slide",
      ],
      notification_type: [
        "assignment_published",
        "assignment_due_soon",
        "submission_graded",
        "quiz_published",
        "quiz_reminder",
        "quiz_graded",
        "grade_posted",
        "announcement",
        "timetable_changed",
        "account",
        "system",
      ],
      publication_status: ["draft", "published", "closed", "archived"],
      question_type: [
        "multiple_choice",
        "multiple_select",
        "true_false",
        "short_answer",
        "essay",
        "fill_blank",
        "matching",
      ],
      storage_bucket: [
        "profile-photos",
        "assignment-uploads",
        "lesson-materials",
        "school-logos",
        "student-documents",
        "message-attachments",
      ],
      student_status: [
        "active",
        "graduated",
        "transferred",
        "withdrawn",
        "suspended",
      ],
      submission_status: [
        "draft",
        "submitted",
        "late",
        "graded",
        "returned",
        "resubmitted",
        "missing",
      ],
      user_status: ["invited", "active", "suspended", "archived"],
    },
  },
} as const

