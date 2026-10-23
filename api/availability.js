import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from('bookings')
    .select('room_id, check_in, check_out')
    .neq('status', 'cancelled')
    .gte('check_out', today);
  if (error) return res.status(500).json({ error: 'Server error' });
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  res.json(data);
}