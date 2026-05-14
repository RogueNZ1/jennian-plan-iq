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
      daily_briefs: {
        Row: {
          id: string
          brief_date: string
          html_content: string
          text_content: string
          summary: string | null
          alert_count: number
          new_listing_count: number
          price_change_count: number
          generated_at: string
        }
        Insert: {
          id?: string
          brief_date: string
          html_content: string
          text_content: string
          summary?: string | null
          alert_count?: number
          new_listing_count?: number
          price_change_count?: number
          generated_at?: string
        }
        Update: {
          id?: string
          brief_date?: string
          html_content?: string
          text_content?: string
          summary?: string | null
          alert_count?: number
          new_listing_count?: number
          price_change_count?: number
          generated_at?: string
        }
        Relationships: []
      }
      email_recipients: {
        Row: {
          id: string
          email: string
          name: string | null
          active: boolean
          added_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          active?: boolean
          added_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          active?: boolean
          added_at?: string
        }
        Relationships: []
      }
      export_logs: {
        Row: {
          export_type: Database["public"]["Enums"]["export_type"]
          exported_by: string
          id: string
          job_id: string
          module_id: string | null
          module_name: string | null
          timestamp: string
        }
        Insert: {
          export_type: Database["public"]["Enums"]["export_type"]
          exported_by: string
          id?: string
          job_id: string
          module_id?: string | null
          module_name?: string | null
          timestamp?: string
        }
        Update: {
          export_type?: Database["public"]["Enums"]["export_type"]
          exported_by?: string
          id?: string
          job_id?: string
          module_id?: string | null
          module_name?: string | null
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
          confidence_label: string | null
          created_at: string
          data_source: string
          extracted_value: number
          id: string
          job_id: string
          notes: string | null
          plan_page_number: number | null
          quantity_type: string
          review_status: string
          source_evidence: string | null
          unit: string
        }
        Insert: {
          approved_value?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          confidence_label?: string | null
          created_at?: string
          data_source?: string
          extracted_value: number
          id?: string
          job_id: string
          notes?: string | null
          plan_page_number?: number | null
          quantity_type: string
          review_status?: string
          source_evidence?: string | null
          unit: string
        }
        Update: {
          approved_value?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          confidence_label?: string | null
          created_at?: string
          data_source?: string
          extracted_value?: number
          id?: string
          job_id?: string
          notes?: string | null
          plan_page_number?: number | null
          quantity_type?: string
          review_status?: string
          source_evidence?: string | null
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
          confidence_score: number | null
          created_at: string
          created_by: string
          id: string
          job_number: string
          plan_thumbnail_url: string | null
          plan_type: string | null
          smw_enabled: boolean | null
          status: Database["public"]["Enums"]["job_status"]
          template: string | null
          updated_at: string
          uploaded_at: string | null
          working_plan_file_id: string | null
          working_plan_page_number: number | null
        }
        Insert: {
          address: string
          client_name: string
          confidence_score?: number | null
          created_at?: string
          created_by: string
          id?: string
          job_number: string
          plan_thumbnail_url?: string | null
          plan_type?: string | null
          smw_enabled?: boolean | null
          status?: Database["public"]["Enums"]["job_status"]
          template?: string | null
          updated_at?: string
          uploaded_at?: string | null
          working_plan_file_id?: string | null
          working_plan_page_number?: number | null
        }
        Update: {
          address?: string
          client_name?: string
          confidence_score?: number | null
          created_at?: string
          created_by?: string
          id?: string
          job_number?: string
          plan_thumbnail_url?: string | null
          plan_type?: string | null
          smw_enabled?: boolean | null
          status?: Database["public"]["Enums"]["job_status"]
          template?: string | null
          updated_at?: string
          uploaded_at?: string | null
          working_plan_file_id?: string | null
          working_plan_page_number?: number | null
        }
        Relationships: []
      }
      listing_changes: {
        Row: {
          id: string
          listing_id: string | null
          change_type: string
          old_value: string | null
          new_value: string | null
          detected_at: string
        }
        Insert: {
          id?: string
          listing_id?: string | null
          change_type: string
          old_value?: string | null
          new_value?: string | null
          detected_at?: string
        }
        Update: {
          id?: string
          listing_id?: string | null
          change_type?: string
          old_value?: string | null
          new_value?: string | null
          detected_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_changes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          }
        ]
      }
      listings: {
        Row: {
          id: string
          source: string
          external_id: string | null
          builder: string | null
          title: string | null
          location: string | null
          suburb: string | null
          city: string | null
          bedrooms: number | null
          bathrooms: number | null
          floor_area_m2: number | null
          land_area_m2: number | null
          price: number | null
          price_display: string | null
          listing_url: string | null
          image_url: string | null
          status: string
          first_seen_at: string
          last_seen_at: string
          created_at: string
        }
        Insert: {
          id?: string
          source: string
          external_id?: string | null
          builder?: string | null
          title?: string | null
          location?: string | null
          suburb?: string | null
          city?: string | null
          bedrooms?: number | null
          bathrooms?: number | null
          floor_area_m2?: number | null
          land_area_m2?: number | null
          price?: number | null
          price_display?: string | null
          listing_url?: string | null
          image_url?: string | null
          status?: string
          first_seen_at?: string
          last_seen_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          external_id?: string | null
          builder?: string | null
          title?: string | null
          location?: string | null
          suburb?: string | null
          city?: string | null
          bedrooms?: number | null
          bathrooms?: number | null
          floor_area_m2?: number | null
          land_area_m2?: number | null
          price?: number | null
          price_display?: string | null
          listing_url?: string | null
          image_url?: string | null
          status?: string
          first_seen_at?: string
          last_seen_at?: string
          created_at?: string
        }
        Relationships: []
      }
      module_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          item_id: string | null
          job_id: string
          module_id: string | null
          new_value: string | null
          notes: string | null
          previous_value: string | null
          run_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          item_id?: string | null
          job_id: string
          module_id?: string | null
          new_value?: string | null
          notes?: string | null
          previous_value?: string | null
          run_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          item_id?: string | null
          job_id?: string
          module_id?: string | null
          new_value?: string | null
          notes?: string | null
          previous_value?: string | null
          run_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_audit_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "module_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_audit_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_audit_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "module_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      module_items: {
        Row: {
          approved_value: string | null
          basis: string | null
          confidence: string | null
          created_at: string
          data_source: string | null
          description: string | null
          extracted_value: string | null
          file_id: string | null
          id: string
          job_id: string
          label: string
          measurement_id: string | null
          module_id: string
          notes: string | null
          opening_id: string | null
          plan_page_number: number | null
          review_status: string
          run_id: string
          sort_order: number
          source: string | null
          source_evidence: string | null
          unit: string | null
          updated_at: string
          value_source: string | null
        }
        Insert: {
          approved_value?: string | null
          basis?: string | null
          confidence?: string | null
          created_at?: string
          data_source?: string | null
          description?: string | null
          extracted_value?: string | null
          file_id?: string | null
          id?: string
          job_id: string
          label: string
          measurement_id?: string | null
          module_id: string
          notes?: string | null
          opening_id?: string | null
          plan_page_number?: number | null
          review_status?: string
          run_id: string
          sort_order?: number
          source?: string | null
          source_evidence?: string | null
          unit?: string | null
          updated_at?: string
          value_source?: string | null
        }
        Update: {
          approved_value?: string | null
          basis?: string | null
          confidence?: string | null
          created_at?: string
          data_source?: string | null
          description?: string | null
          extracted_value?: string | null
          file_id?: string | null
          id?: string
          job_id?: string
          label?: string
          measurement_id?: string | null
          module_id?: string
          notes?: string | null
          opening_id?: string | null
          plan_page_number?: number | null
          review_status?: string
          run_id?: string
          sort_order?: number
          source?: string | null
          source_evidence?: string | null
          unit?: string | null
          updated_at?: string
          value_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "module_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      module_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confidence_avg: number | null
          created_at: string
          id: string
          item_count: number
          job_id: string
          last_run_at: string | null
          module_id: string
          module_name: string
          required: boolean
          review_status: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_avg?: number | null
          created_at?: string
          id?: string
          item_count?: number
          job_id: string
          last_run_at?: string | null
          module_id: string
          module_name: string
          required?: boolean
          review_status?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_avg?: number | null
          created_at?: string
          id?: string
          item_count?: number
          job_id?: string
          last_run_at?: string | null
          module_id?: string
          module_name?: string
          required?: boolean
          review_status?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_schedule: {
        Row: {
          confidence: string
          created_at: string
          created_by: string
          file_id: string | null
          height_mm: number | null
          id: string
          job_id: string
          notes: string | null
          opening_type: string
          plan_page_number: number
          quantity: number
          review_status: string
          room_name: string | null
          source: string
          source_evidence: string | null
          updated_at: string
          width_mm: number
        }
        Insert: {
          confidence?: string
          created_at?: string
          created_by: string
          file_id?: string | null
          height_mm?: number | null
          id?: string
          job_id: string
          notes?: string | null
          opening_type?: string
          plan_page_number?: number
          quantity?: number
          review_status?: string
          room_name?: string | null
          source?: string
          source_evidence?: string | null
          updated_at?: string
          width_mm: number
        }
        Update: {
          confidence?: string
          created_at?: string
          created_by?: string
          file_id?: string | null
          height_mm?: number | null
          id?: string
          job_id?: string
          notes?: string | null
          opening_type?: string
          plan_page_number?: number
          quantity?: number
          review_status?: string
          room_name?: string | null
          source?: string
          source_evidence?: string | null
          updated_at?: string
          width_mm?: number
        }
        Relationships: []
      }
      plan_calibrations: {
        Row: {
          calibrated_at: string
          calibrated_by: string
          calibration_line_pixels: number
          calibration_method: string
          calibration_real_mm: number
          calibration_source: string
          confidence: string
          created_at: string
          file_id: string | null
          id: string
          job_id: string
          pixels_per_mm: number
          plan_page_number: number
          scale_text: string | null
          updated_at: string
        }
        Insert: {
          calibrated_at?: string
          calibrated_by: string
          calibration_line_pixels: number
          calibration_method?: string
          calibration_real_mm: number
          calibration_source?: string
          confidence?: string
          created_at?: string
          file_id?: string | null
          id?: string
          job_id: string
          pixels_per_mm: number
          plan_page_number?: number
          scale_text?: string | null
          updated_at?: string
        }
        Update: {
          calibrated_at?: string
          calibrated_by?: string
          calibration_line_pixels?: number
          calibration_method?: string
          calibration_real_mm?: number
          calibration_source?: string
          confidence?: string
          created_at?: string
          file_id?: string | null
          id?: string
          job_id?: string
          pixels_per_mm?: number
          plan_page_number?: number
          scale_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_measurement_audit_logs: {
        Row: {
          action: string
          calibration_id: string | null
          created_at: string
          id: string
          job_id: string
          measurement_id: string | null
          new_value: string | null
          notes: string | null
          opening_id: string | null
          previous_value: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          calibration_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          measurement_id?: string | null
          new_value?: string | null
          notes?: string | null
          opening_id?: string | null
          previous_value?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          calibration_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          measurement_id?: string | null
          new_value?: string | null
          notes?: string | null
          opening_id?: string | null
          previous_value?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plan_measurements: {
        Row: {
          calculated_area_m2: number | null
          calculated_length_m: number | null
          calculated_length_mm: number | null
          category: string | null
          confidence: string
          count_value: number | null
          created_at: string
          created_by: string
          file_id: string | null
          id: string
          job_id: string
          label: string | null
          measurement_type: string
          module_id: string | null
          notes: string | null
          plan_page_number: number
          points_json: Json
          review_status: string
          source: string
          updated_at: string
        }
        Insert: {
          calculated_area_m2?: number | null
          calculated_length_m?: number | null
          calculated_length_mm?: number | null
          category?: string | null
          confidence?: string
          count_value?: number | null
          created_at?: string
          created_by: string
          file_id?: string | null
          id?: string
          job_id: string
          label?: string | null
          measurement_type: string
          module_id?: string | null
          notes?: string | null
          plan_page_number?: number
          points_json?: Json
          review_status?: string
          source?: string
          updated_at?: string
        }
        Update: {
          calculated_area_m2?: number | null
          calculated_length_m?: number | null
          calculated_length_mm?: number | null
          category?: string | null
          confidence?: string
          count_value?: number | null
          created_at?: string
          created_by?: string
          file_id?: string | null
          id?: string
          job_id?: string
          label?: string | null
          measurement_type?: string
          module_id?: string | null
          notes?: string | null
          plan_page_number?: number
          points_json?: Json
          review_status?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accepted_at: string | null
          branch: string | null
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
          branch?: string | null
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
          branch?: string | null
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
      takeoff_runs: {
        Row: {
          calibration_id: string | null
          classification_confidence: string | null
          classification_reason: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          scale_text: string | null
          started_at: string
          started_by: string
          status: string
          summary: Json
          updated_at: string
          working_file_id: string | null
          working_page_number: number | null
          working_page_type: string | null
        }
        Insert: {
          calibration_id?: string | null
          classification_confidence?: string | null
          classification_reason?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          scale_text?: string | null
          started_at?: string
          started_by: string
          status?: string
          summary?: Json
          updated_at?: string
          working_file_id?: string | null
          working_page_number?: number | null
          working_page_type?: string | null
        }
        Update: {
          calibration_id?: string | null
          classification_confidence?: string | null
          classification_reason?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          scale_text?: string | null
          started_at?: string
          started_by?: string
          status?: string
          summary?: Json
          updated_at?: string
          working_file_id?: string | null
          working_page_number?: number | null
          working_page_type?: string | null
        }
        Relationships: []
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
      user_invitations: {
        Row: {
          branch: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          invited_by: string
          last_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          branch?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          invited_by: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          branch?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          invited_by?: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: []
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
      vision_takeoff_pages: {
        Row: {
          created_at: string
          created_by: string
          file_id: string
          id: string
          job_id: string
          page_number: number
          page_type: string | null
          render_resolution: number
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by: string
          file_id: string
          id?: string
          job_id: string
          page_number: number
          page_type?: string | null
          render_resolution?: number
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          file_id?: string
          id?: string
          job_id?: string
          page_number?: number
          page_type?: string | null
          render_resolution?: number
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_takeoff_pages_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_takeoff_pages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
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
      app_role: "owner" | "admin" | "estimator" | "viewer" | "project_manager"
      confidence_level: "high" | "mid" | "low"
      export_type: "csv" | "excel"
      file_type: "plan" | "specification" | "electrical"
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
      app_role: ["owner", "admin", "estimator", "viewer", "project_manager"],
      confidence_level: ["high", "mid", "low"],
      export_type: ["csv", "excel"],
      file_type: ["plan", "specification", "electrical"],
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
