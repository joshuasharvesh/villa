import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRICES = { LENEK: 380, CHAAH: 380, SABAR: 380, SIPUL: 290,
  GERCHANG: 290, MAMBANG: 250, BEKOK: 250, WHOLE_VILLA: 2200 };
const ALL_ROOMS = ['LENEK','CHAAH','SABAR','SIPUL','GERCHANG','MAMBANG','BEKOK'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};

  const roomId = String(b.roomId || '');
  if (!(roomId in PRICES)) return res.status(400).json({ error: 'Unknown room' });
  if (!DATE_RE.test(b.checkIn) || !DATE_RE.test(b.checkOut))
    return res.status(400).json({ error: 'Invalid dates' });

  const ci = new Date(b.checkIn + 'T00:00:00Z');
  const co = new Date(b.checkOut + 'T00:00:00Z');
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const nights = Math.round((co - ci) / 86400000);
  if (!(nights >= 1 && nights <= 30) || ci < today)
    return res.status(400).json({ error: 'Invalid dates' });

  const name = String(b.guestName || '').trim().slice(0, 100);
  const phone = String(b.guestPhone || '').trim();
  const email = String(b.guestEmail || '').trim().slice(0, 150);
  const notes = String(b.notes || '').trim().slice(0, 500);
  const guests = Math.min(Math.max(parseInt(b.guests, 10) || 2, 1), 18);
  if (!name || !/^[\d+\s-]{8,20}$/.test(phone) || !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: 'Please check your details' });

  const total = nights * PRICES[roomId];   // price comes from the server, not the browser
  const ref = 'VO-' + Date.now().toString(36).toUpperCase() +
              Math.random().toString(36).slice(2, 5).toUpperCase();
  const targets = roomId === 'WHOLE_VILLA' ? ALL_ROOMS : [roomId];

  const { error } = await db.from('bookings').insert(targets.map(r => ({
    booking_ref: ref, room_id: r, booked_as: roomId,
    check_in: b.checkIn, check_out: b.checkOut, nights,
    guest_name: name, guest_phone: phone, guest_email: email,
    guests, total_rm: total, notes,
  })));

  if (error) {
    if (error.code === '23P01')
      return res.status(409).json({ error: 'Sorry, those dates were just taken.' });
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }

  try {   // an email failure must not cancel the booking
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [process.env.OWNER_EMAIL],
        subject: `New booking ${ref}: ${roomId} ${b.checkIn} to ${b.checkOut}`,
        text: `Ref: ${ref}\nRoom: ${roomId}\n${b.checkIn} to ${b.checkOut} (${nights} nights)\n` +
              `Guest: ${name} / ${phone} / ${email}\nGuests: ${guests}\nTotal: RM ${total}\n` +
              `Notes: ${notes || 'None'}\n\nStatus: PENDING PAYMENT`,
      }),
    });
  } catch (e) { console.error('email failed', e); }

  res.status(201).json({ bookingRef: ref, totalRM: total, nights });
}