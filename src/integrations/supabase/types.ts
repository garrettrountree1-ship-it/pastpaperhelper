export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          id: string
          occurred_at: string
          seconds: number
          section: string
          user_id: string
        }
        Insert: {
          id?: string
          occurred_at?: string
          seconds?: number
          section: string
          user_id: string
        }
        Update: {
          id?: string
          occurred_at?: string
          seconds?: number
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      answers: {
        Row: {
          answer_text: string
          attempt_history: Json
          attempts: number
          awarded_marks: number
          feedback: string | null
          id: string
          image_paths: string[]
          mark_breakdown: Json
          question_id: string
          resolved: boolean
          submission_id: string
          time_spent_seconds: number
          updated_at: string
          verdict: string | null
        }
        Insert: {
          answer_text?: string
          attempt_history?: Json
          attempts?: number
          awarded_marks?: number
          feedback?: string | null
          id?: string
          image_paths?: string[]
          mark_breakdown?: Json
          question_id: string
          resolved?: boolean
          submission_id: string
          time_spent_seconds?: number
          updated_at?: string
          verdict?: string | null
        }
        Update: {
          answer_text?: string
          attempt_history?: Json
          attempts?: number
          awarded_marks?: number
          feedback?: string | null
          id?: string
          image_paths?: string[]
          mark_breakdown?: Json
          question_id?: string
          resolved?: boolean
          submission_id?: string
          time_spent_seconds?: number
          updated_at?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_vocab: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          language: string
          terms: Json
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          language?: string
          terms?: Json
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          language?: string
          terms?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assignment_vocab_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          class_id: string
          created_at: string
          created_by: string
          curriculum: string
          due_at: string | null
          id: string
          instructions: string | null
          keyword_translation: boolean | null
          mark_scheme_revealed: boolean
          photo_mode: string
          published: boolean
          subject: string
          title: string
          vocab_language: string | null
          vocab_translation: boolean
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by: string
          curriculum?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          keyword_translation?: boolean | null
          mark_scheme_revealed?: boolean
          photo_mode?: string
          published?: boolean
          subject?: string
          title: string
          vocab_language?: string | null
          vocab_translation?: boolean
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string
          curriculum?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          keyword_translation?: boolean | null
          mark_scheme_revealed?: boolean
          photo_mode?: string
          published?: boolean
          subject?: string
          title?: string
          vocab_language?: string | null
          vocab_translation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_announcements: {
        Row: {
          author_id: string
          body: string
          class_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          author_id: string
          body: string
          class_id: string
          created_at?: string
          id?: string
          title?: string
        }
        Update: {
          author_id?: string
          body?: string
          class_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_coteachers: {
        Row: {
          added_by: string | null
          class_id: string
          created_at: string
          id: string
          teacher_id: string
        }
        Insert: {
          added_by?: string | null
          class_id: string
          created_at?: string
          id?: string
          teacher_id: string
        }
        Update: {
          added_by?: string | null
          class_id?: string
          created_at?: string
          id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_coteachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_game_settings: {
        Row: {
          class_id: string
          created_at: string
          enabled: boolean
          game_key: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          enabled?: boolean
          game_key: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          enabled?: boolean
          game_key?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_game_settings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_members: {
        Row: {
          class_id: string
          id: string
          joined_at: string
          student_id: string
        }
        Insert: {
          class_id: string
          id?: string
          joined_at?: string
          student_id: string
        }
        Update: {
          class_id?: string
          id?: string
          joined_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_messages: {
        Row: {
          assignment_id: string | null
          body: string
          class_id: string
          created_at: string
          id: string
          question_id: string | null
          sender_id: string
          sender_role: string
          student_id: string
          topic: string
        }
        Insert: {
          assignment_id?: string | null
          body: string
          class_id: string
          created_at?: string
          id?: string
          question_id?: string | null
          sender_id: string
          sender_role?: string
          student_id: string
          topic?: string
        }
        Update: {
          assignment_id?: string | null
          body?: string
          class_id?: string
          created_at?: string
          id?: string
          question_id?: string | null
          sender_id?: string
          sender_role?: string
          student_id?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_messages_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_messages_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_student_settings: {
        Row: {
          class_id: string
          created_at: string
          gradebook_detail: boolean | null
          id: string
          keyword_translation: boolean | null
          student_can_change_level: boolean | null
          student_id: string
          tutor_language: string | null
          tutor_level: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          gradebook_detail?: boolean | null
          id?: string
          keyword_translation?: boolean | null
          student_can_change_level?: boolean | null
          student_id: string
          tutor_language?: string | null
          tutor_level?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          gradebook_detail?: boolean | null
          id?: string
          keyword_translation?: boolean | null
          student_can_change_level?: boolean | null
          student_id?: string
          tutor_language?: string | null
          tutor_level?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_student_settings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_units: {
        Row: {
          class_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          planned_classes: number | null
          planned_end: string | null
          planned_start: string | null
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          planned_classes?: number | null
          planned_end?: string | null
          planned_start?: string | null
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          planned_classes?: number | null
          planned_end?: string | null
          planned_start?: string | null
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_units_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          ai_warning_limit: number
          created_at: string
          curriculum: string
          gradebook_detail: boolean
          id: string
          join_code: string
          keyword_translation: boolean
          name: string
          protect_questions: boolean
          student_can_change_level: boolean
          subject: string
          teacher_id: string
          tutor_language: string
          tutor_level: string
          vocab_language: string | null
          vocab_translation: boolean
        }
        Insert: {
          ai_warning_limit?: number
          created_at?: string
          curriculum?: string
          gradebook_detail?: boolean
          id?: string
          join_code: string
          keyword_translation?: boolean
          name: string
          protect_questions?: boolean
          student_can_change_level?: boolean
          subject?: string
          teacher_id: string
          tutor_language?: string
          tutor_level?: string
          vocab_language?: string | null
          vocab_translation?: boolean
        }
        Update: {
          ai_warning_limit?: number
          created_at?: string
          curriculum?: string
          gradebook_detail?: boolean
          id?: string
          join_code?: string
          keyword_translation?: boolean
          name?: string
          protect_questions?: boolean
          student_can_change_level?: boolean
          subject?: string
          teacher_id?: string
          tutor_language?: string
          tutor_level?: string
          vocab_language?: string | null
          vocab_translation?: boolean
        }
        Relationships: []
      }
      daily_doubles: {
        Row: {
          answer_text: string
          attempts: number
          awarded: number
          class_id: string
          correct: boolean
          day: string
          ends_at: string
          finished_at: string | null
          id: string
          question_id: string
          started_at: string
          student_id: string
        }
        Insert: {
          answer_text?: string
          attempts?: number
          awarded?: number
          class_id: string
          correct?: boolean
          day?: string
          ends_at: string
          finished_at?: string | null
          id?: string
          question_id: string
          started_at?: string
          student_id: string
        }
        Update: {
          answer_text?: string
          attempts?: number
          awarded?: number
          class_id?: string
          correct?: boolean
          day?: string
          ends_at?: string
          finished_at?: string | null
          id?: string
          question_id?: string
          started_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_doubles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_doubles_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      formative_checks: {
        Row: {
          class_id: string
          closed_at: string | null
          created_at: string
          ends_at: string
          expected_answer: string | null
          id: string
          question: string
          seconds: number
          section_id: string | null
          teacher_id: string
        }
        Insert: {
          class_id: string
          closed_at?: string | null
          created_at?: string
          ends_at: string
          expected_answer?: string | null
          id?: string
          question: string
          seconds?: number
          section_id?: string | null
          teacher_id: string
        }
        Update: {
          class_id?: string
          closed_at?: string | null
          created_at?: string
          ends_at?: string
          expected_answer?: string | null
          id?: string
          question?: string
          seconds?: number
          section_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formative_checks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      formative_responses: {
        Row: {
          answer: string
          attempt: number
          check_id: string
          created_at: string
          feedback: string | null
          id: string
          student_id: string
          verdict: string
        }
        Insert: {
          answer: string
          attempt?: number
          check_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          student_id: string
          verdict: string
        }
        Update: {
          answer?: string
          attempt?: number
          check_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          student_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "formative_responses_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "formative_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      game_attempts: {
        Row: {
          answer_text: string
          attempts: number
          correct: boolean
          ends_at: string
          finished_at: string | null
          id: string
          match_id: string
          seconds: number | null
          started_at: string
          student_id: string
        }
        Insert: {
          answer_text?: string
          attempts?: number
          correct?: boolean
          ends_at: string
          finished_at?: string | null
          id?: string
          match_id: string
          seconds?: number | null
          started_at?: string
          student_id: string
        }
        Update: {
          answer_text?: string
          attempts?: number
          correct?: boolean
          ends_at?: string
          finished_at?: string | null
          id?: string
          match_id?: string
          seconds?: number | null
          started_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_attempts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "game_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      game_matches: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          question_id: string
          resolved_at: string | null
          student_a: string
          student_b: string
          winner_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          question_id: string
          resolved_at?: string | null
          student_a: string
          student_b: string
          winner_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          question_id?: string
          resolved_at?: string | null
          student_a?: string
          student_b?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_matches_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_matches_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_profiles: {
        Row: {
          alias: string
          class_id: string
          created_at: string
          id: string
          student_id: string
          tokens: number
        }
        Insert: {
          alias: string
          class_id: string
          created_at?: string
          id?: string
          student_id: string
          tokens?: number
        }
        Update: {
          alias?: string
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rounds: {
        Row: {
          answer_text: string
          attempts: number
          awarded: number
          class_id: string
          correct: boolean
          day: string
          ends_at: string
          finished_at: string | null
          id: string
          kind: string
          payload: Json
          question_id: string | null
          started_at: string
          state: Json
          student_id: string
          wager: number
        }
        Insert: {
          answer_text?: string
          attempts?: number
          awarded?: number
          class_id: string
          correct?: boolean
          day?: string
          ends_at: string
          finished_at?: string | null
          id?: string
          kind: string
          payload?: Json
          question_id?: string | null
          started_at?: string
          state?: Json
          student_id: string
          wager?: number
        }
        Update: {
          answer_text?: string
          attempts?: number
          awarded?: number
          class_id?: string
          correct?: boolean
          day?: string
          ends_at?: string
          finished_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          question_id?: string | null
          started_at?: string
          state?: Json
          student_id?: string
          wager?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rounds_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_flags: {
        Row: {
          confidence: number
          created_at: string
          excerpt: string
          id: string
          question_id: string | null
          reason: string
          submission_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          excerpt?: string
          id?: string
          question_id?: string | null
          reason?: string
          submission_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          excerpt?: string
          id?: string
          question_id?: string | null
          reason?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrity_flags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrity_flags_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      question_exclusions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          question_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          question_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          question_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_exclusions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          image_paths: string[]
          keyword_glossary: Json
          mark_scheme: string
          marks: number
          photo_mode: string
          position: number
          question_text: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          image_paths?: string[]
          keyword_glossary?: Json
          mark_scheme: string
          marks?: number
          photo_mode?: string
          position?: number
          question_text: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          image_paths?: string[]
          keyword_glossary?: Json
          mark_scheme?: string
          marks?: number
          photo_mode?: string
          position?: number
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          answer_text: string
          attempt_id: string
          awarded_marks: number
          feedback: string | null
          id: string
          image_paths: string[]
          mark_breakdown: Json
          question_id: string
          updated_at: string
          verdict: string | null
        }
        Insert: {
          answer_text?: string
          attempt_id: string
          awarded_marks?: number
          feedback?: string | null
          id?: string
          image_paths?: string[]
          mark_breakdown?: Json
          question_id: string
          updated_at?: string
          verdict?: string | null
        }
        Update: {
          answer_text?: string
          attempt_id?: string
          awarded_marks?: number
          feedback?: string | null
          id?: string
          image_paths?: string[]
          mark_breakdown?: Json
          question_id?: string
          updated_at?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          awarded_marks: number
          ends_at: string
          id: string
          quiz_id: string
          started_at: string
          status: string
          student_id: string
          submitted_at: string | null
          total_marks: number
        }
        Insert: {
          awarded_marks?: number
          ends_at: string
          id?: string
          quiz_id: string
          started_at?: string
          status?: string
          student_id: string
          submitted_at?: string | null
          total_marks?: number
        }
        Update: {
          awarded_marks?: number
          ends_at?: string
          id?: string
          quiz_id?: string
          started_at?: string
          status?: string
          student_id?: string
          submitted_at?: string | null
          total_marks?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          created_at: string
          id: string
          image_paths: string[]
          mark_scheme: string
          marks: number
          position: number
          question_text: string
          quiz_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_paths?: string[]
          mark_scheme: string
          marks?: number
          position?: number
          question_text: string
          quiz_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_paths?: string[]
          mark_scheme?: string
          marks?: number
          position?: number
          question_text?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          class_id: string
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string
          released_at: string | null
          reveal_mark_scheme: boolean
          show_score: boolean
          subject: string
          time_limit_minutes: number
          title: string
        }
        Insert: {
          class_id: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          instructions?: string
          released_at?: string | null
          reveal_mark_scheme?: boolean
          show_score?: boolean
          subject?: string
          time_limit_minutes?: number
          title: string
        }
        Update: {
          class_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          instructions?: string
          released_at?: string | null
          reveal_mark_scheme?: boolean
          show_score?: boolean
          subject?: string
          time_limit_minutes?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_assignment_settings: {
        Row: {
          assignment_id: string
          created_at: string
          due_at: string | null
          id: string
          keyword_translation: boolean | null
          mark_scheme_revealed: boolean
          photo_mode: string | null
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          keyword_translation?: boolean | null
          mark_scheme_revealed?: boolean
          photo_mode?: string | null
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          keyword_translation?: boolean | null
          mark_scheme_revealed?: boolean
          photo_mode?: string | null
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_assignment_settings_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          ai_flag_count: number
          assignment_id: string
          awarded_marks: number
          created_at: string
          id: string
          locked_at: string | null
          locked_reason: string | null
          penalty_percent: number
          status: string
          student_id: string
          submitted_at: string | null
          total_marks: number
        }
        Insert: {
          ai_flag_count?: number
          assignment_id: string
          awarded_marks?: number
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_reason?: string | null
          penalty_percent?: number
          status?: string
          student_id: string
          submitted_at?: string | null
          total_marks?: number
        }
        Update: {
          ai_flag_count?: number
          assignment_id?: string
          awarded_marks?: number
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_reason?: string | null
          penalty_percent?: number
          status?: string
          student_id?: string
          submitted_at?: string | null
          total_marks?: number
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          email: string
          id: string
          replied_at: string | null
          reply: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          email?: string
          id?: string
          replied_at?: string | null
          reply?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          email?: string
          id?: string
          replied_at?: string | null
          reply?: string | null
          user_id?: string
        }
        Relationships: []
      }
      token_ledger: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          reason: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          reason?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          reason?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_ledger_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_messages: {
        Row: {
          answer_id: string
          content: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          answer_id: string
          content: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          answer_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_messages_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_materials: {
        Row: {
          allow_download: boolean
          class_id: string
          content_type: string | null
          created_at: string
          created_by: string
          external_url: string | null
          file_name: string | null
          file_size: number | null
          id: string
          kind: string
          position: number
          storage_path: string | null
          title: string
          unit_id: string
        }
        Insert: {
          allow_download?: boolean
          class_id: string
          content_type?: string | null
          created_at?: string
          created_by: string
          external_url?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind?: string
          position?: number
          storage_path?: string | null
          title: string
          unit_id: string
        }
        Update: {
          allow_download?: boolean
          class_id?: string
          content_type?: string | null
          created_at?: string
          created_by?: string
          external_url?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind?: string
          position?: number
          storage_path?: string | null
          title?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_materials_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_materials_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "class_units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_sections: {
        Row: {
          ai_summary: string | null
          ai_summary_updated_at: string | null
          class_id: string
          created_at: string
          created_by: string
          id: string
          material_id: string | null
          notes_blocks: Json
          notes_text: string
          planned_classes: number | null
          planned_end: string | null
          planned_start: string | null
          position: number
          title: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          class_id: string
          created_at?: string
          created_by: string
          id?: string
          material_id?: string | null
          notes_blocks?: Json
          notes_text?: string
          planned_classes?: number | null
          planned_end?: string | null
          planned_start?: string | null
          position?: number
          title: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          class_id?: string
          created_at?: string
          created_by?: string
          id?: string
          material_id?: string | null
          notes_blocks?: Json
          notes_text?: string
          planned_classes?: number | null
          planned_end?: string | null
          planned_start?: string | null
          position?: number
          title?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_sections_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "unit_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_sections_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "class_units"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vocab_explanations: {
        Row: {
          assignment_id: string
          created_at: string
          explanation: string
          id: string
          image_urls: string[]
          language: string
          level: string
          term: string
          translation: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          explanation?: string
          id?: string
          image_urls?: string[]
          language?: string
          level?: string
          term: string
          translation?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          explanation?: string
          id?: string
          image_urls?: string[]
          language?: string
          level?: string
          term?: string
          translation?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_explanations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_study_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      can_study_quiz: {
        Args: { _quiz_id: string; _user_id: string }
        Returns: boolean
      }
      can_teach_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      can_teach_quiz: {
        Args: { _quiz_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_class_coteacher: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_member: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_owner: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_teacher: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      owns_answer: {
        Args: { _answer_id: string; _user_id: string }
        Returns: boolean
      }
      owns_quiz_attempt: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: boolean
      }
      owns_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      teaches_answer: {
        Args: { _answer_id: string; _user_id: string }
        Returns: boolean
      }
      teaches_quiz_attempt: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: boolean
      }
      teaches_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "teacher" | "student"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["teacher", "student"],
    },
  },
} as const
