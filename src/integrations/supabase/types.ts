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
      agents: {
        Row: {
          answer: string | null
          created_at: string
          id: string
          index: number
          status: string
          step_count: number
          task: Json
          world_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          id?: string
          index: number
          status?: string
          step_count?: number
          task?: Json
          world_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          id?: string
          index?: number
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
      runs: {
        Row: {
          config: Json
          created_at: string
          id: string
          label: string | null
          status: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          label?: string | null
          status?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          label?: string | null
          status?: string
        }
        Relationships: []
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
          created_at: string
          cross_agent_read: boolean
          id: string
          monitor_label: string | null
          monitor_note: string | null
          monitor_severity: number | null
          observation: string | null
          reasoning: string | null
          step_index: number
          world_id: string
        }
        Insert: {
          action?: Json
          agent_id: string
          created_at?: string
          cross_agent_read?: boolean
          id?: string
          monitor_label?: string | null
          monitor_note?: string | null
          monitor_severity?: number | null
          observation?: string | null
          reasoning?: string | null
          step_index: number
          world_id: string
        }
        Update: {
          action?: Json
          agent_id?: string
          created_at?: string
          cross_agent_read?: boolean
          id?: string
          monitor_label?: string | null
          monitor_note?: string | null
          monitor_severity?: number | null
          observation?: string | null
          reasoning?: string | null
          step_index?: number
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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
