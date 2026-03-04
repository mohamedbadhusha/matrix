// Auto-generated Supabase database types
// Run: npx supabase gen types typescript --project-id <your-project-id> > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          tier: string;
          is_active: boolean;
          daily_trades_used: number;
          daily_trades_reset_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: string;
          tier?: string;
          is_active?: boolean;
          daily_trades_used?: number;
          daily_trades_reset_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      broker_accounts: {
        Row: {
          id: string;
          user_id: string;
          broker: string;
          client_id: string;
          api_key: string;
          access_token: string | null;
          is_active: boolean;
          mode: string;
          auth_method: string;
          app_secret: string | null;
          token_expires_at: string | null;
          health_status: string;
          failure_count: number;
          last_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          broker?: string;
          client_id: string;
          api_key: string;
          access_token?: string | null;
          is_active?: boolean;
          mode?: string;
          auth_method?: string;
          app_secret?: string | null;
          token_expires_at?: string | null;
          health_status?: string;
        };
        Update: Partial<Database['public']['Tables']['broker_accounts']['Insert']>;
      };
      trade_nodes: {
        Row: {
          id: string;
          user_id: string;
          broker_account_id: string | null;
          is_master_signal: boolean;
          origin: string;
          parent_trade_id: string | null;
          exit_price: number | null;
          realised_pnl: number | null;
          updated_at: string;
          symbol: string;
          strike: string;
          trading_symbol: string;
          security_id: string | null;
          exchange: string;
          protocol: string;
          target_mode: string;
          mode: string;
          entry_price: number;
          ltp: number | null;
          sl: number;
          initial_sl: number;
          t1: number;
          t2: number;
          t3: number;
          lots: number;
          lot_size: number;
          remaining_quantity: number;
          remaining_buckets: number;
          lots_per_bucket: number;
          qty_per_bucket: number;
          t1_hit: boolean;
          t2_hit: boolean;
          t3_hit: boolean;
          sl_hit: boolean;
          is_processing: boolean;
          booked_pnl: number;
          max_price_reached: number | null;
          broker_order_id: string | null;
          sl_order_id: string | null;
          status: string;
          ltp_source: string;
          created_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          broker_account_id?: string | null;
          is_master_signal?: boolean;
          origin?: string;
          parent_trade_id?: string | null;
          symbol: string;
          strike: string;
          trading_symbol: string;
          security_id?: string | null;
          exchange?: string;
          protocol: string;
          target_mode?: string;
          mode?: string;
          entry_price: number;
          sl: number;
          initial_sl: number;
          t1: number;
          t2: number;
          t3: number;
          lots: number;
          lot_size: number;
          remaining_quantity: number;
          remaining_buckets: number;
          lots_per_bucket: number;
          qty_per_bucket: number;
          status?: string;
          ltp_source?: string;
        };
        Update: Partial<Database['public']['Tables']['trade_nodes']['Insert']>;
      };
      copy_subscriptions: {
        Row: {
          id: string;
          follower_id: string;
          leader_id: string;
          is_active: boolean;
          lot_multiplier: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          leader_id: string;
          is_active?: boolean;
          lot_multiplier?: number;
        };
        Update: Partial<Database['public']['Tables']['copy_subscriptions']['Insert']>;
      };
      order_logs: {
        Row: {
          id: string;
          trade_id: string;
          user_id: string;
          broker_order_id: string | null;
          order_type: string | null;
          transaction_type: string | null;
          quantity: number | null;
          price: number | null;
          status: string | null;
          error_message: string | null;
          raw_response: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trade_id: string;
          user_id: string;
          broker_order_id?: string | null;
          order_type?: string | null;
          transaction_type?: string | null;
          quantity?: number | null;
          price?: number | null;
          status?: string | null;
          error_message?: string | null;
          raw_response?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['order_logs']['Insert']>;
      };
      trade_events: {
        Row: {
          id: string;
          trade_id: string;
          user_id: string | null;
          event_type: string;
          price: number | null;
          quantity: number | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trade_id: string;
          user_id?: string | null;
          event_type: string;
          price?: number | null;
          quantity?: number | null;
          payload?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['trade_events']['Insert']>;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          tier: string;
          status: string;
          starts_at: string | null;
          expires_at: string | null;
          razorpay_subscription_id: string | null;
          payment_ref: string | null;
          amount: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tier: string;
          status?: string;
          starts_at?: string | null;
          expires_at?: string | null;
          razorpay_subscription_id?: string | null;
          payment_ref?: string | null;
          amount?: number | null;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
      };
      system_flags: {
        Row: {
          flag_key: string;
          flag_value: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          flag_key: string;
          flag_value?: boolean;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['system_flags']['Insert']>;
      };
      broker_health: {
        Row: {
          broker_id: string;
          state: string;
          failure_count: number;
          last_checked_at: string;
          last_error: string | null;
        };
        Insert: {
          broker_id: string;
          state?: string;
          failure_count?: number;
          last_checked_at?: string;
          last_error?: string | null;
        };
        Update: Partial<Database['public']['Tables']['broker_health']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
