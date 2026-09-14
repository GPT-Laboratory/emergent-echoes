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
      account_requests: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          email: string
          note: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          email: string
          note?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          note?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          answer: string | null
          created_at: string
          finished_at: string | null
          id: string
          index: number
          started_at: string | null
          status: string
          step_count: number
          task: Json
          world_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          index: number
          started_at?: string | null
          status?: string
          step_count?: number
          task?: Json
          world_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          index?: number
          started_at?: string | null
          status?: string
          step_count?: number
          task?: Json
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          human_action: string | null
          id: string
          label: string
          severity: number
          step_id: string | null
          world_id: string
        }
        Insert: {
          created_at?: string
          human_action?: string | null
          id?: string
          label: string
          severity: number
          step_id?: string | null
          world_id: string
        }
        Update: {
          created_at?: string
          human_action?: string | null
          id?: string
          label?: string
          severity?: number
          step_id?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          base_seed: number | null
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          fixed_config: Json
          id: string
          started_at: string
          status: string
          sweep_points: Json
          task_mode: string
          type: string
        }
        Insert: {
          base_seed?: number | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          fixed_config?: Json
          id?: string
          started_at?: string
          status?: string
          sweep_points?: Json
          task_mode?: string
          type?: string
        }
        Update: {
          base_seed?: number | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          fixed_config?: Json
          id?: string
          started_at?: string
          status?: string
          sweep_points?: Json
          task_mode?: string
          type?: string
        }
        Relationships: []
      }
      human_codings: {
        Row: {
          coded_at: string
          human_awareness: string | null
          human_severity: number | null
          id: string
          sample_seed: number | null
          step_id: string
        }
        Insert: {
          coded_at?: string
          human_awareness?: string | null
          human_severity?: number | null
          id?: string
          sample_seed?: number | null
          step_id: string
        }
        Update: {
          coded_at?: string
          human_awareness?: string | null
          human_severity?: number | null
          id?: string
          sample_seed?: number | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_codings_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: true
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          api_seed: number | null
          config: Json
          created_at: string
          duration_ms: number | null
          experiment_id: string | null
          finished_at: string | null
          id: string
          label: string | null
          replicate_index: number
          replicate_seed: number | null
          started_at: string
          status: string
          sweep_value: number | null
        }
        Insert: {
          api_seed?: number | null
          config?: Json
          created_at?: string
          duration_ms?: number | null
          experiment_id?: string | null
          finished_at?: string | null
          id?: string
          label?: string | null
          replicate_index?: number
          replicate_seed?: number | null
          started_at?: string
          status?: string
          sweep_value?: number | null
        }
        Update: {
          api_seed?: number | null
          config?: Json
          created_at?: string
          duration_ms?: number | null
          experiment_id?: string | null
          finished_at?: string | null
          id?: string
          label?: string | null
          replicate_index?: number
          replicate_seed?: number | null
          started_at?: string
          status?: string
          sweep_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      scratch: {
        Row: {
          author_agent_id: string | null
          created_at: string
          id: string
          key: string
          value: string
          world_id: string
        }
        Insert: {
          author_agent_id?: string | null
          created_at?: string
          id?: string
          key: string
          value: string
          world_id: string
        }
        Update: {
          author_agent_id?: string | null
          created_at?: string
          id?: string
          key?: string
          value?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scratch_author_agent_id_fkey"
            columns: ["author_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scratch_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      steps: {
        Row: {
          action: Json
          agent_id: string
          awareness_label: string | null
          awareness_quote: string | null
          created_at: string
          cross_agent_read: boolean
          foreign_keys: string[]
          id: string
          monitor_label: string | null
          monitor_note: string | null
          monitor_severity: number | null
          observation: string | null
          raw_output: string | null
          reasoning: string | null
          step_index: number
          tokens_in: number | null
          tokens_out: number | null
          tokens_reasoning: number | null
          world_id: string
        }
        Insert: {
          action?: Json
          agent_id: string
          awareness_label?: string | null
          awareness_quote?: string | null
          created_at?: string
          cross_agent_read?: boolean
          foreign_keys?: string[]
          id?: string
          monitor_label?: string | null
          monitor_note?: string | null
          monitor_severity?: number | null
          observation?: string | null
          raw_output?: string | null
          reasoning?: string | null
          step_index: number
          tokens_in?: number | null
          tokens_out?: number | null
          tokens_reasoning?: number | null
          world_id: string
        }
        Update: {
          action?: Json
          agent_id?: string
          awareness_label?: string | null
          awareness_quote?: string | null
          created_at?: string
          cross_agent_read?: boolean
          foreign_keys?: string[]
          id?: string
          monitor_label?: string | null
          monitor_note?: string | null
          monitor_severity?: number | null
          observation?: string | null
          raw_output?: string | null
          reasoning?: string | null
          step_index?: number
          tokens_in?: number | null
          tokens_out?: number | null
          tokens_reasoning?: number | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      worlds: {
        Row: {
          created_at: string
          cross_agent_read: boolean
          first_cross_read_step: number | null
          first_flag_step: number | null
          id: string
          index: number
          run_id: string
          solicit_write: boolean
          status: string
          task_seed: number | null
        }
        Insert: {
          created_at?: string
          cross_agent_read?: boolean
          first_cross_read_step?: number | null
          first_flag_step?: number | null
          id?: string
          index: number
          run_id: string
          solicit_write?: boolean
          status?: string
          task_seed?: number | null
        }
        Update: {
          created_at?: string
          cross_agent_read?: boolean
          first_cross_read_step?: number | null
          first_flag_step?: number | null
          id?: string
          index?: number
          run_id?: string
          solicit_write?: boolean
          status?: string
          task_seed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worlds_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
