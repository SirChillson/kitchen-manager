import { createClient } from '@supabase/supabase-js'

// PASTE YOUR SUPABASE URL INSIDE THE QUOTES
const supabaseUrl = 'https://iwcmlzdgfwbvgdjjydxj.supabase.co'

// PASTE YOUR "ANON PUBLIC" KEY INSIDE THE QUOTES
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3Y21semRnZndidmdkamp5ZHhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDUyNTUsImV4cCI6MjA4MDc4MTI1NX0.xBqRDiNBfbMBX9uMCQpCrIZN9DylESUQVLx2GpsIf0o'

export const supabase = createClient(supabaseUrl, supabaseKey)