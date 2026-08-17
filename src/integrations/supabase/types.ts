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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          answer_text: string
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
      assignments: {
        Row: {
          class_id: string
          created_at: string
          created_by: string
          curriculum: string
          due_at: string | null
          id: string
          instructions: string | null
          published: boolean
          subject: string
          title: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by: string
          curriculum?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          published?: boolean
          subject?: string
          title: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string
          curriculum?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          published?: boolean
          subject?: string
          title?: string
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
      classes: {
        Row: {
          created_at: string
          curriculum: string
          id: string
          join_code: string
          name: string
          subject: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          curriculum?: string
          id?: string
          join_code: string
          name: string
          subject?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          curriculum?: string
          id?: string
          join_code?: string
          name?: string
          subject?: string
          teacher_id?: string
        }
        Relationships: []
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
      questions: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          image_paths: string[]
          mark_scheme: string
          marks: number
          position: number
          question_text: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          image_paths?: string[]
          mark_scheme: string
          marks?: number
          position?: number
          question_text: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          image_paths?: string[]
          mark_scheme?: string
          marks?: number
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
      submissions: {
        Row: {
          ai_flag_count: number
          assignment_id: string
          awarded_marks: number
          created_at: string
          id: string
          locked_at: string | null
          locked_reason: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_study_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      can_teach_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_class_member: {
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
      owns_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      teaches_answer: {
        Args: { _answer_id: string; _user_id: string }
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
      app_role: ["teacher", "student"],
    },
  },
} as const
