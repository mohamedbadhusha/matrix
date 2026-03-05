// Replaces old supabase createClient boilerplate with shared supabase-admin import
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'api', '_handlers');

let fixed = 0;
fs.readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .forEach((file) => {
    const fp = path.join(dir, file);
    let c = fs.readFileSync(fp, 'utf8');
    if (!c.includes('SUPABASE_URL')) return;

    const hasDhan = c.includes('DHAN_BASE_URL');
    const newImport = hasDhan
      ? "import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';"
      : "import { supabaseAdmin as supabase } from '../_lib/supabase-admin.js';";

    // 1. Remove: import { createClient } from '@supabase/supabase-js';
    c = c.replace(/import \{ createClient \} from '@supabase\/supabase-js';\n/, '');

    // 2. Remove: const supabase = createClient(\n  process.env.SUPABASE_URL!,\n  process.env.SUPABASE_SERVICE_ROLE_KEY!,\n);\n
    c = c.replace(/\nconst supabase = createClient\(\n  process\.env\.SUPABASE_URL!,\n  process\.env\.SUPABASE_SERVICE_ROLE_KEY!,\n\);\n/, '\n');

    // 3. Remove DHAN_BASE const if now provided by import
    if (hasDhan) {
      c = c.replace(/\nconst DHAN_BASE = process\.env\.DHAN_BASE_URL \?\? 'https:\/\/api\.dhan\.co\/v2';\n/, '\n');
    }

    // 4. Insert new import right after the VercelRequest/VercelResponse import line
    c = c.replace(/(import type \{ VercelRequest[^\n]*\n)/, `$1${newImport}\n`);

    fs.writeFileSync(fp, c);
    console.log('Fixed:', file);
    fixed++;
  });

console.log(`\nTotal fixed: ${fixed}`);
