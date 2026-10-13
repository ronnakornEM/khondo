import './env.js';
import { getPool } from './db.js';
import { hashPassword } from './auth.js';
import { DEFAULT_LANDING } from '../shared/types.js';

// Demo workspace for local development:  npm run db:migrate && npm run db:seed
// Login: demo@khondo.app / demo1234  (Premium). Public page: /a/nok-property
if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

const art = (a: string, b: string, label: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g fill="#fff" fill-opacity=".85"><rect x="250" y="190" width="130" height="260" rx="6"/><rect x="400" y="260" width="150" height="190" rx="6"/></g><g fill="${a}" fill-opacity=".55">${[0, 1, 2, 3, 4].map((i) => `<rect x="268" y="${210 + i * 46}" width="30" height="26" rx="3"/><rect x="326" y="${210 + i * 46}" width="30" height="26" rx="3"/>`).join('')}</g><text x="400" y="520" font-family="sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#fff">${label}</text></svg>`,
  );

const pool = getPool();
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;

async function main() {
  await q("DELETE FROM users WHERE email = 'demo@khondo.app'");
  const [user] = await q('INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id', ['demo@khondo.app', await hashPassword('demo1234')]);
  const landing = { ...DEFAULT_LANDING, heroSubtitle: 'Condos, houses and land across Khon Kaen — I’ll help you find the right one.', announcement: 'Open house this Saturday · Lake View Residence 10:00–16:00', facebook: 'https://facebook.com', instagram: 'https://instagram.com' };
  const [agent] = await q(
    `INSERT INTO agents (user_id, slug, display_name, headline, bio, phone, line_id, contact_email, landing, plan, plan_renews_at)
     VALUES ($1,'nok-property','Nok Property','Condo specialist · Khon Kaen','Born and raised in Khon Kaen, I have helped over 200 families buy, sell and rent homes around Mueang Khon Kaen, Khon Kaen University and Bueng Kaen Nakhon.\n\nFluent in Thai and English. Free viewings, honest advice.','081-234-5678','@nokproperty','nok@example.com',$2::jsonb,'premium', now() + interval '30 days') RETURNING id`,
    [user.id, JSON.stringify(landing)],
  );

  const P = [
    ['Lake View Residence 1BR – Bueng Kaen Nakhon', 'condo', 'sale', 'available', 1890000, null, 1, 1, 34, null, 12, 'Lake View Residence', 'Mueang Khon Kaen', true, ['#0f766e', '#38bdf8'], ['Swimming pool', 'Fitness', '24h security', 'Lake view', 'Parking'], 'Bright corner unit on the 12th floor overlooking Bueng Kaen Nakhon. Fully furnished, ready to move in. 5 minutes to Central Khon Kaen.'],
    ['Studio near Khon Kaen University', 'condo', 'rent', 'available', null, 7500, 1, 1, 26, null, 5, 'Campus Condo', 'Mueang Khon Kaen', false, ['#7c3aed', '#f0abfc'], ['Furnished', 'Near KKU', 'Fibre internet', 'Parking'], 'Perfect for students and lecturers. Water and internet included. Walk to KKU main gate.'],
    ['Modern 3BR Townhome', 'townhouse', 'sale', 'reserved', 3200000, null, 3, 3, 150, 22, null, 'Moo 4, Ban Thum', 'Mueang Khon Kaen', false, ['#c2410c', '#fbbf24'], ['Garden', 'Parking', 'Pet friendly'], 'Two-storey townhome in a quiet gated village, 10 minutes from the city centre.'],
    ['Corner Land 100 sq wah – Ban Phai Road', 'land', 'sale', 'available', 4500000, null, null, null, null, 100, null, 'Ban Phai Rd', 'Ban Phai', false, ['#15803d', '#bef264'], ['Near main road'], 'Flat, filled land with road frontage — ideal for a house or small business.'],
    ['Pool Villa 4BR – Nong Rawiang', 'house', 'both', 'available', 8900000, 45000, 4, 4, 320, 80, null, 'Nong Rawiang', 'Mueang Khon Kaen', true, ['#1d4ed8', '#67e8f9'], ['Swimming pool', 'Garden', 'Parking', 'Furnished'], 'Private pool villa with a big garden and a maid’s room. Available for sale or long-term rent.'],
    ['Riverside 2BR Condo', 'condo', 'sale', 'sold', 2650000, null, 2, 2, 58, null, 8, 'Riverside Khon Kaen', 'Mueang Khon Kaen', false, ['#be123c', '#fda4af'], ['Swimming pool', 'Fitness'], 'Sold in 3 weeks.'],
    ['Shophouse on Srichan Road', 'commercial', 'rent', 'rented', null, 28000, null, 2, 120, null, null, 'Srichan Rd', 'Mueang Khon Kaen', false, ['#a16207', '#fde68a'], ['Main road'], 'Ground-floor shophouse in the heart of the old town.'],
  ] as const;
  const propIds: string[] = [];
  for (const p of P) {
    const [row] = await q(
      `INSERT INTO properties (agent_id,title,type,listing_type,status,price,rent_price,bedrooms,bathrooms,area_sqm,land_sqw,floor,address,district,featured,photos,amenities,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18) RETURNING id`,
      [agent.id, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], JSON.stringify([art(p[14][0], p[14][1], p[0].split(' – ')[0].slice(0, 28))]), p[15], p[16]],
    );
    propIds.push(row.id);
  }

  await q(`INSERT INTO inquiries (agent_id, property_id, name, phone, message, created_at) VALUES
    ($1,$2,'Khun Pim','089-111-2222','Is the unit still available? Can I visit on Sunday?', now() - interval '3 hours'),
    ($1,$3,'Daniel (KKU lecturer)','','Interested in a 12-month lease. Email me details.', now() - interval '1 day'),
    ($1,NULL,'Khun Somchai','082-333-4444','Looking for land near Ban Phai, budget around 4M.', now() - interval '2 days')`, [agent.id, propIds[0], propIds[1]]);
  await q(`UPDATE inquiries SET email='daniel@example.com' WHERE name LIKE 'Daniel%'`);

  const contacts = await q(
    `INSERT INTO contacts (agent_id,name,phone,line_id,kind,stage,source,property_id,budget,tags,notes) VALUES
     ($1,'Khun Malee','086-555-0101','malee.k','tenant','viewing','line',$2,9000,'{vip,rent}','Wants to move in by December. Has a small dog.'),
     ($1,'Khun Somchai','082-333-4444','','buyer','contacted','website',$3,4500000,'{land,cash}','Prefers Ban Phai road frontage.'),
     ($1,'Khun Pim','089-111-2222','pim_pim','buyer','new','website',$4,2000000,'{condo}','Asked about lake-view units.'),
     ($1,'Khun Prasert','081-777-8899','','seller','negotiating','referral',NULL,NULL,'{seller,townhome}','Wants to sell a townhome in Ban Thum. Listing agreement pending.'),
     ($1,'Khun Wipa','084-222-3333','wipa.w','landlord','won','manual',$5,NULL,'{landlord}','Owns the Srichan shophouse. Renewal in April.'),
     ($1,'Khun Anan','083-123-4567','','buyer','lost','manual',NULL,1500000,'{}','Bought elsewhere.') RETURNING id,name`,
    [agent.id, propIds[1], propIds[3], propIds[0], propIds[6]],
  );
  const cid = (n: string) => contacts.find((c) => c.name === n)!.id;

  const d = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  await q(
    `INSERT INTO bills (agent_id,number,contact_id,property_id,kind,status,items,total,issue_date,due_date,paid_at,notes) VALUES
     ($1,'INV-2026-0001',$2,$3,'rent','paid','[{"description":"Monthly rent – Sep","qty":1,"unitPrice":7500},{"description":"Water & internet","qty":1,"unitPrice":350}]',7850,$6,$6,now() - interval '30 days','PromptPay 081-234-5678'),
     ($1,'INV-2026-0002',$2,$3,'rent','sent','[{"description":"Monthly rent – Oct","qty":1,"unitPrice":7500},{"description":"Water & internet","qty":1,"unitPrice":350}]',7850,$7,$7,NULL,'PromptPay 081-234-5678'),
     ($1,'INV-2026-0003',$4,$5,'commission','sent','[{"description":"Sales commission 3%","qty":1,"unitPrice":57000}]',57000,$8,$9,NULL,'Bank transfer – Kasikorn 123-4-56789-0'),
     ($1,'INV-2026-0004',$2,$3,'deposit','draft','[{"description":"Security deposit (2 months)","qty":2,"unitPrice":7500}]',15000,$8,$9,NULL,'')`,
    [agent.id, cid('Khun Malee'), propIds[1], cid('Khun Prasert'), propIds[2], d(-40), d(-8), d(0), d(10)],
  );

  const at = (days: number, hour: number, mins = 0) => {
    const x = new Date();
    x.setDate(x.getDate() + days);
    x.setHours(hour, mins, 0, 0);
    return x.toISOString();
  };
  const ev = [
    ['Viewing – Lake View Residence', 'viewing', at(1, 10), at(1, 11), false, 'Lake View Residence', cid('Khun Pim'), propIds[0], 'none', null, 30],
    ['Viewing – Campus Condo (Khun Malee)', 'viewing', at(2, 14), at(2, 15), false, 'Campus Condo', cid('Khun Malee'), propIds[1], 'none', null, 60],
    ['Weekly team stand-up', 'meeting', at(0, 9), at(0, 9, 30), false, 'Café Amazon, Khon Kaen', null, null, 'weekly', null, 15],
    ['Call Khun Prasert – listing agreement', 'call', at(3, 16), at(3, 16, 30), false, '', cid('Khun Prasert'), null, 'none', null, 15],
    ['Sign rental contract', 'signing', at(5, 11), at(5, 12), false, 'Land Office, Khon Kaen', cid('Khun Wipa'), propIds[6], 'none', null, 1440],
    ['Pay condo common fees', 'task', at(4, 0), at(4, 0), true, '', null, null, 'monthly', null, null],
    ['Open house – Lake View Residence', 'viewing', at(((6 - new Date().getDay()) + 7) % 7 || 7, 10), at(((6 - new Date().getDay()) + 7) % 7 || 7, 16), false, 'Lake View Residence', null, propIds[0], 'none', null, 60],
  ] as const;
  for (const e of ev) {
    await q(
      `INSERT INTO events (agent_id,title,kind,start_at,end_at,all_day,location,contact_id,property_id,recurrence,recurrence_until,reminder_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [agent.id, ...e],
    );
  }
  console.log('Seeded. Login: demo@khondo.app / demo1234  ·  Public page: /a/nok-property');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
