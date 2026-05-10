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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: Json | null
          previous_value: Json | null
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      export_logs: {
        Row: {
          export_type: Database["public"]["Enums"]["export_type"]
          exported_by: string
          id: string
          job_id: string
          timestamp: string
        }
        Insert: {
          export_type: Database["public"]["Enums"]["export_type"]
          exported_by: string
          id?: string
          job_id: string
          timestamp?: string
        }
        Update: {
          export_type?: Database["public"]["Enums"]["export_type"]
          exported_by?: string
          id?: string
          job_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_quantities: {
        Row: {
          approved_value: number | null
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          extracted_value: number
          id: string
          job_id: string
          notes: string | null
          quantity_type: string
          unit: string
        }
        Insert: {
          approved_value?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          extracted_value: number
          id?: string
          job_id: string
          notes?: string | null
          quantity_type: string
          unit: string
        }
        Update: {
          approved_value?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          extracted_value?: number
          id?: string
          job_id?: string
          notes?: string | null
          quantity_type?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracted_quantities_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string
          client_name: string
          created_at: string
          created_by: string
          id: string
          job_number: string
          plan_thumbnail_url: string | null
          status: Database["public"]["Enums"]["job_status"]
          template: string | null
          updated_at: string
          uploaded_at: string | null
        }
        Insert: {
          address: string
          client_name: string
          created_at?: string
          created_by: string
          id?: string
          job_number: string
          plan_thumbnail_url?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template?: string | null
          updated_at?: string
          uploaded_at?: string | null
        }
        Update: {
          address?: string
          client_name?: string
          created_at?: string
          created_by?: string
          id?: string
          job_number?: string
          plan_thumbnail_url?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template?: string | null
          updated_at?: string
          uploaded_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          last_login_at: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: []
      }
      quantity_overrides: {
        Row: {
          edited_by: string
          id: string
          new_value: number
          original_value: number
          quantity_id: string
          reason: string | null
          timestamp: string
        }
        Insert: {
          edited_by: string
          id?: string
          new_value: number
          original_value: number
          quantity_id: string
          reason?: string | null
          timestamp?: string
        }
        Update: {
          edited_by?: string
          id?: string
          new_value?: number
          original_value?: number
          quantity_id?: string
          reason?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "quantity_overrides_quantity_id_fkey"
            columns: ["quantity_id"]
            isOneToOne: false
            referencedRelation: "extracted_quantities"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          file_name: string
          file_type: Database["public"]["Enums"]["file_type"]
          id: string
          job_id: string
          storage_url: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          file_type: Database["public"]["Enums"]["file_type"]
          id?: string
          job_id: string
          storage_url: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          file_type?: Database["public"]["Enums"]["file_type"]
          id?: string
          job_id?: string
          storage_url?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "admin" | "estimator" | "viewer"
      confidence_level: "high" | "mid" | "low"
      export_type: "csv" | "excel"
      file_type: "plan" | "specification"
      job_status:
        | "draft"
        | "uploaded"
        | "extracted"
        | "review_required"
        | "approved"
        | "exported"
      profile_status: "invited" | "active" | "suspended"
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
      app_role: ["owner", "admin", "estimator", "viewer"],
      confidence_level: ["high", "mid", "low"],
      export_type: ["csv", "excel"],
      file_type: ["plan", "specification"],
      job_status: [
        "draft",
        "uploaded",
        "extracted",
        "review_required",
        "approved",
        "exported",
      ],
      profile_status: ["invited", "active", "suspended"],
    },
  },
} as const
