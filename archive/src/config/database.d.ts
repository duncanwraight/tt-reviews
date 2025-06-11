import { SupabaseClient } from '@supabase/supabase-js';
import { Environment } from '../types/environment';
export declare function createSupabaseClient(env: Environment, accessToken?: string, useServiceRole?: boolean): SupabaseClient;
export declare function createSupabaseAdminClient(env: Environment): SupabaseClient;
//# sourceMappingURL=database.d.ts.map